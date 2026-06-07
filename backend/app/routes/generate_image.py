# backend/app/routes/generate_image.py
#
# Uses @cf/lykon/dreamshaper-8-lcm via Cloudflare Workers AI.
# The model returns raw PNG binary (not JSON), so we read response.content
# and base64-encode it directly.
# All generated images are also saved to rendered_images/ for the gallery.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import base64
import os
from datetime import datetime
from pathlib import Path
import preferences
#loggers
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional

log_dir = os.path.join(os.getenv('APPDATA'), 'PixNarr', 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'pixnarr_backend.log')

logger = logging.getLogger("pixnarr_backend")
if not logger.handlers:
    _fh = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    _fh.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.setLevel(logging.INFO)
    logger.addHandler(_fh)

logger.info("Initializing generate_image route")

router = APIRouter(prefix="/api")


pref = preferences.Preferences()  # Initialize preferences (creates file if not exists)


# ── Folder to persist all generated images ────────────────────────────────────

#try to check if our out_put directory is present if present use it else put the default there

rpath = pref.get("rendered_images_path", None)
if rpath and os.path.isdir(rpath):
    IMAGES_DIR = rpath
else:
    IMAGES_DIR = os.path.join(Path.home(), "PixNarr", "rendered_images")
    os.makedirs(IMAGES_DIR, exist_ok=True)
    pref.set("rendered_images_path", IMAGES_DIR)
    

#if generate_image is yes in our preferences then only we will generate the image otherwise we will skip the image generation and return a message to the user
GENERATE_IMAGE = pref.get("generate_image", "").strip().lower()
if GENERATE_IMAGE == "":
    #if the preference is not set then we will set it to yes by default
    pref.set("generate_image", "yes")
    GENERATE_IMAGE = "yes"    


MODEL = "@cf/lykon/dreamshaper-8-lcm"


class ImageGenerationRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = None
    sceneId: str = ""
    width:  Optional[int] = None   # 256–2048, default from aspect ratio
    height: Optional[int] = None   # 256–2048, default from aspect ratio
    num_steps: Optional[int] = 20  # max 20 for dreamshaper-8-lcm
    guidance:  Optional[float] = 7.5


# ── Load accounts from preferences ────────────────────────────────────────────────────
# Format: ACCOUNTID1.APIKEY1,ACCOUNTID2.APIKEY2,...
def _get_accounts() -> list[dict]:
    #raw = os.getenv("WORKER_AI_ACCOUNT_API", "").strip()
    raw = pref.get("WORKER_AI_ACCOUNT_API", "").strip()
    #strip sorounding whitespace and ignore if empty
    raw = raw.strip() if raw else ""
    if not raw:
        logger.info("No WORKER_AI_ACCOUNT_API set; image generation will be unavailable")
        raise RuntimeError("WORKER_AI_ACCOUNT_API preference is not set")

    accounts = []
    for item in raw.split(","):
        item = item.strip()
        if "." in item:
            account_id, api_key = item.split(".", 1)
            accounts.append({
                "account_id": account_id.strip(),
                "api_key":    api_key.strip(),
            })

    if not accounts:
        logger.error("No valid Cloudflare accounts found in WORKER_AI_ACCOUNT_API")
        raise RuntimeError("No valid Cloudflare accounts found in WORKER_AI_ACCOUNT_API")

    return accounts


def _save_to_disk(image_bytes: bytes, scene_id: str) -> str:
    """Save raw PNG bytes to rendered_images/ with a unique timestamped filename."""
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]   # trim microseconds to 3 digits
    name = f"image_{scene_id}_{ts}.png" if scene_id else f"image_{ts}.png"
    path = os.path.join(IMAGES_DIR, name)
    with open(path, "wb") as f:
        f.write(image_bytes)
    logger.info(f"Saved generated image as {name} ({len(image_bytes)//1024} KB)")
    print(f"[images] Saved {name} ({len(image_bytes)//1024} KB)")
    return name


@router.post("/generate-image")
async def generate_image(request: ImageGenerationRequest):
    if not request.prompt or not request.prompt.strip():
        logger.warning("Image generation request missing prompt")
        raise HTTPException(status_code=400, detail="Prompt is required")
    

    if GENERATE_IMAGE != "yes":
        logger.info("Image generation is disabled in preferences; skipping generation")
        return {
            "success": False,
            "message": "Image generation is disabled in preferences.",
            "sceneId": request.sceneId,
        } 
    accounts   = _get_accounts()
    last_error = None

    # Build the payload — only include fields that have values
    payload: dict = {
        "prompt":    request.prompt,
        "num_steps": min(request.num_steps or 20, 20),   # hard cap at 20
        "guidance":  request.guidance or 7.5,
    }

    if request.negative_prompt:
        payload["negative_prompt"] = request.negative_prompt

    # Width / height must be multiples of 8 and within 256–2048
    def _clamp_dim(v: int) -> int:
        v = max(256, min(2048, v))
        return v - (v % 8)   # round down to nearest 8

    if request.width:
        payload["width"]  = _clamp_dim(request.width)
    if request.height:
        payload["height"] = _clamp_dim(request.height)

    # Try each account in order; skip on rate-limit / quota errors
    for acc in accounts:
        account_id = acc["account_id"]
        api_key    = acc["api_key"]

        url = (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{account_id}/ai/run/{MODEL}"
        )
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                # dreamshaper-8-lcm returns raw binary PNG, not JSON
                content_type = response.headers.get("content-type", "")

                if "image" in content_type or len(response.content) > 1000:
                    # Raw PNG bytes
                    image_bytes  = response.content
                    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

                    # Persist to rendered_images/
                    saved_name = _save_to_disk(image_bytes, request.sceneId)
                    logger.info(f"Image generated for scene '{request.sceneId}' using account {account_id}")
                    print(f"✅ Image generated for scene '{request.sceneId}' "
                          f"using account {account_id}")

                    return {
                        "success":     True,
                        "imageBase64": image_base64,
                        "sceneId":     request.sceneId,
                        "savedAs":     saved_name,
                        "usedAccount": account_id,
                        "timestamp":   datetime.utcnow().isoformat() + "Z",
                    }

                # Unexpected JSON response — treat as error
                try:
                    data = response.json()
                    last_error = f"Unexpected JSON response: {data}"
                except Exception:
                    logger.error(f"Unexpected non-JSON response with content-type {content_type} from account {account_id}")
                    last_error = f"Unexpected response (content-type: {content_type})"

            else:
                last_error = f"HTTP {response.status_code}: {response.text[:400]}"
                if response.status_code in (429, 402, 403):
                    logger.warning(f"Account {account_id} rate-limited or quota exceeded (status {response.status_code})")
                    print(f"⚠️ Account {account_id} rate-limited "
                          f"({response.status_code}), trying next…")
                    continue

        except httpx.TimeoutException:
            last_error = f"Timeout on account {account_id}"
            logger.warning(f"Timeout while generating image with account {account_id}, trying next…")
            print(f"⏱ Timeout on account {account_id}, trying next…")
            continue
        except Exception as e:
            last_error = str(e)
            logger.exception(f"Error while generating image with account {account_id}: {e}")
            print(f"❌ Error with account {account_id}: {e}")
            continue

    # All accounts exhausted
    logger.error(f"All Cloudflare accounts failed for image generation. Last error: {last_error}")
    raise HTTPException(
        status_code=502,
        detail=f"All Cloudflare accounts failed. Last error: {last_error}",
    )
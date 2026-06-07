# backend/app/routes/download_music.py
#
# Downloads audio from an external URL (bypasses browser CORS),
# saves it to rendered_audios/ with a unique timestamped filename,
# and returns the audio as base64 for immediate use in the frontend.

from fastapi import APIRouter, HTTPException
import httpx
import base64
import os
from datetime import datetime
from pydantic import BaseModel
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



router = APIRouter()

pref = preferences.Preferences()  # Initialize preferences (creates file if not exists)

logger.info("Initializing download_music route")

# ── Folder to persist all downloaded audio ────────────────────────────────────
#try to check if our out_put directory is present if present use it else put the default there

rpath = pref.get("rendered_audios_path", None)
if rpath and os.path.isdir(rpath):
    AUDIOS_DIR = rpath
else:
    AUDIOS_DIR = os.path.join(Path.home(), "PixNarr", "rendered_audios")
    os.makedirs(AUDIOS_DIR, exist_ok=True)
    pref.set("rendered_audios_path", AUDIOS_DIR)
    


class MusicDownloadRequest(BaseModel):
    music_url: str
    filename:  str = "background_music.mp3"   # used as label only, not the saved name


def _unique_audio_filename(original: str) -> str:
    """
    Build a unique filename:
      audio_<original_stem>_YYYYMMDD_HHMMSS_mmm.<ext>
    e.g.  audio_SoundHelix-Song-8_20260516_143201_047.mp3
    """
    stem = os.path.splitext(os.path.basename(original))[0]
    ext  = os.path.splitext(original)[1].lower() or ".mp3"
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:22]   # _f gives 6 digits; take first 3 extra
    # keep stem short and filesystem-safe
    safe_stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)[:40]
    return f"audio_{safe_stem}_{ts}{ext}"


@router.post("/api/download-music")
async def download_music(request: MusicDownloadRequest):
    """
    Downloads audio from an external URL and returns it as base64.
    Also saves a copy to rendered_audios/ for the Audio panel gallery.
    """
    logger.info(f"Downloading music from URL: {request.music_url} with filename: {request.filename}")
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.get(
                request.music_url,
                follow_redirects=True,
                headers={"User-Agent": "PixnarrBot/1.0"},
            )

        if response.status_code != 200:
            logger.error(f"Failed to download music. Status: {response.status_code}, URL: {request.music_url}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download music. Status: {response.status_code}",
            )

        content_type = response.headers.get("content-type", "audio/mpeg")

        # Warn but don't block — some CDNs return application/octet-stream
        if not (
            content_type.startswith("audio/")
            or request.music_url.lower().endswith((".mp3", ".wav", ".m4a", ".ogg"))
        ):
            print(f"[warn] Unexpected content-type for audio: {content_type}")
            logger.warning(f"Unexpected content-type for audio: {content_type} from URL: {request.music_url}")
        audio_bytes = response.content

        # ── Save to rendered_audios/ ──────────────────────────────────────────
        saved_name = _unique_audio_filename(request.filename or request.music_url)
        save_path  = os.path.join(AUDIOS_DIR, saved_name)
        with open(save_path, "wb") as f:
            f.write(audio_bytes)
        
        logger.info(f"Downloaded music from {request.music_url} saved as {saved_name} ({len(audio_bytes)//1024} KB)")
        print(f"[audios] Saved {saved_name} ({len(audio_bytes)//1024} KB)")

        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

        return {
            "success":     True,
            "audioBase64": audio_base64,
            "contentType": content_type or "audio/mpeg",
            "savedAs":     saved_name,
            "filename":    request.filename,
            "size":        len(audio_bytes),
        }

    except httpx.TimeoutException:
        logger.error(f"Timeout while downloading music from URL: {request.music_url}")
        raise HTTPException(status_code=408, detail="Download timed out")
    except HTTPException:
        logger.error(f"HTTP error while downloading music from URL: {request.music_url}")
        raise
    except Exception as e:
        logger.exception("Unhandled error in download_music: %s", e)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
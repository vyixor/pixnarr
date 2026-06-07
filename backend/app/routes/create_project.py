# backend/app/routes/create_project.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
import uuid
from datetime import datetime
import json
import httpx
import os
from dotenv import load_dotenv

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

# Load .env file
load_dotenv()

router = APIRouter(prefix="/api")

# Get API key from .env
#GROQ_API_KEY = os.getenv("GROQ_API_KEY")

#Get API key from our preferences system to allow dynamic updates without restarting the app
from preferences import Preferences
prefs = Preferences()
GROQ_API_KEY = prefs.get("GROQ_API_KEY", None)
GROQ_API_KEY = GROQ_API_KEY.strip() if GROQ_API_KEY else None

if not GROQ_API_KEY:
    #WARN FOR NOW DO NOT CLOSE THE APP BECAUSE OF THIS AS IT CAN BE SET LATER AND WE WANT TO ALLOW THAT, JUST LOG AN ERROR
    logger.warning("GROQ_API_KEY is not set in Preferences file. The app will continue to run, but some features may not work as expected.")
    print("[Warning] GROQ_API_KEY is not set in Preferences file")
else:
  logger.info("GROQ_API_KEY loaded successfully")
  print("GROQ_API_KEY loaded successfully")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

logger.info("GROQ_URL initialized")

class GenerateRequest(BaseModel):
    script: str
    style: str
    platform: str
    video_type: str
    constant_prompt: Optional[str] = ""
    aspect_ratio: str
    duration: str
    enable_voiceover: bool
    voice_type: Optional[str] = "Female (Soft)"
    music_option: str
    selected_music: Optional[Dict] = None
    uploaded_music_name: Optional[str] = None


# SYSTEM_PROMPT_TEMPLATE (with placeholders)
SYSTEM_PROMPT_TEMPLATE = """
You are an expert cinematic video director, AI image prompt engineer, and JSON architect for Pixnarr.
Your task is to transform the user's script and configuration into a production-ready, emotionally engaging video project with visually coherent, cinematically specific scene prompts.

═══════════════════════════════════════════════════════════════════════════════
CORE RULES
═══════════════════════════════════════════════════════════════════════════════
1.  Break the script into 5 (minimum) to 30 (maximum) logical, well-paced scenes. Let the script's natural narrative structure guide every split.
2.  Every scene must carry real narrative weight — no filler, no padding, no idea repeated across scenes.
3.  Every "text" field must be natural spoken voiceover — written exactly as a human would say it aloud.
4.  Minimum scene duration: 5 seconds. Maximum: 12 seconds. All durations must sum to EXACTLY {{target_duration}} seconds.
5.  startTime for each scene = cumulative sum of all previous scene durations. Scene 1 always starts at 0.
6.  voice.duration must always equal the scene's duration exactly — no exceptions.
7.  Vary tone and mood progressively to build a clear emotional arc: open with energy, develop with depth, close with resolution.
8.  Never repeat the same animationType in two consecutive scenes.
9.  If any configuration value is missing or ambiguous, infer the most sensible default from context — never leave a placeholder unresolved.
10. Output ONLY valid JSON. Response must start with { and end with }. No markdown, no preamble, no commentary.
11. targetDuration is given in seconds to aid your duration calculations.

═══════════════════════════════════════════════════════════════════════════════
CONSTANT PROMPT — INTELLIGENT APPLICATION (Read carefully)
═══════════════════════════════════════════════════════════════════════════════
The constantPrompt is NOT a block of text to paste into every scene.
It is a director's brief — a set of visual intentions that you must interpret
intelligently and apply selectively based on what each scene actually shows.

User provided constant prompt: "{{constant_prompt}}".


STEP 1 — ANALYSE the constant prompt before writing any scene.
Identify every distinct element it contains, for example:
  • Character descriptions  (a young Beninese woman in a yellow dress)
  • Recurring locations     (a modern Lagos office, a dusty Sahel road)
  • Style / mood directives (dark cyberpunk neon, warm golden-hour glow)
  • Brand / colour palette  (Pixnarr teal and midnight blue)
  • Recurring props / items (a battered leather journal, a glowing tablet)
  • Atmosphere rules        (always overcast, always hyper-real)

STEP 2 — DECIDE per scene which elements apply.
Ask yourself for each element: "Does this element belong in THIS scene's shot?"
  ✔ A CHARACTER appears only when the scene involves that character.
      If the scene is an aerial city shot, the character is NOT in it.
  ✔ A LOCATION appears only when the scene is set there.
      If the scene cuts to a flashback, the main location is NOT in it.
  ✔ A STYLE / PALETTE applies to EVERY scene — it is visual glue.
  ✔ A PROP appears only in scenes where it is narratively relevant.
  ✔ An ATMOSPHERE RULE (lighting, weather) applies to every scene unless
      the script explicitly calls for a contrast (e.g. "flashback" or "dream").

STEP 3 — ADAPT, don't copy-paste.
When an element does apply, rewrite it to fit the scene's specific framing,
action, and mood. Never paste the constant prompt verbatim into a scene.
  ✗ Wrong: "...modern Lagos office, a dusty Sahel road, dark cyberpunk neon..."
  ✓ Right: "...her fingers hover over a holographic keyboard in a midnight-blue
            Lagos boardroom, neon signage bleeding through floor-to-ceiling glass..."

STEP 4 — FILL the gap when the constant doesn't apply.
If a scene needs a setting or subject not covered by the constant prompt,
invent a vivid, cinematically specific description that still matches the
overall visual style and mood defined by the constant.

═══════════════════════════════════════════════════════════════════════════════
IMAGE PROMPT CONSTRUCTION — Per Scene
═══════════════════════════════════════════════════════════════════════════════
Build every visual.prompt using this template as a guide — not a rigid fill-in-the-blank:

  "{{style}} style, {{video_type}} video.[ADAPTED constant elements that apply to THIS scene]. [SCENE-SPECIFIC cinematic description]. [mood] atmosphere with [tone] tone, cinematic lighting, highly detailed, professional composition, emotional depth, {{aspect_ratio}} aspect ratio, masterpiece."

Rules for the scene-specific cinematic description:
  • Describe EXACTLY what the viewer sees: subjects, setting, framing, lighting, action.
  • Be specific. Vague prompts produce weak images.
      ✗ Weak:   "a busy street"
      ✓ Strong: "a rain-slicked street in Cotonou at dusk, motorcycle headlights
                 streaking past market stalls draped in orange fabric, steam rising
                 from a roadside food cart in the foreground"
  • Every scene must be visually DISTINCT — zero recycled phrasing between scenes.
  • The framing and composition must match the animation type:
      zoom_in / zoom_out → medium or wide establishing shots with depth
      pan_left / pan_right → wide horizontal compositions with lateral interest
      ken_burns → rich detailed environments worth slowly exploring
      fade_in → bold, graphic, high-contrast compositions
      static → intimate close-ups or carefully composed tableaux

═══════════════════════════════════════════════════════════════════════════════
ANIMATION TYPES — Vary naturally, never repeat consecutively
═══════════════════════════════════════════════════════════════════════════════
zoom_in | zoom_out | pan_left | pan_right | ken_burns | fade_in | static

Match animation to scene energy:
  • High-energy / urgent scenes  → zoom_in, ken_burns
  • Calm / reflective scenes     → static, fade_in
  • Revealing / expansive scenes → pan_left, pan_right, zoom_out

═══════════════════════════════════════════════════════════════════════════════
SCENE CHECKLIST — Verify every scene before finalising output
═══════════════════════════════════════════════════════════════════════════════
✔ "text" reads as natural spoken dialogue — not a headline or bullet point
✔ "duration" is between 5–12 and correctly contributes to the {{target_duration}} total
✔ "voice.duration" exactly matches "duration"
✔ "startTime" equals the cumulative sum of all previous scene durations
✔ "visual.prompt" is cinematically specific, unique to this scene, and applies
    only the constant prompt elements that genuinely belong in this shot
✔ "animationType" differs from the previous scene
✔ "tone" and "mood" are single descriptive words
✔ The constant prompt has NOT been pasted verbatim — it has been interpreted

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — Follow this structure exactly
═══════════════════════════════════════════════════════════════════════════════
{
  "projectId": "string",
  "projectName": "string",
  "createdAt": "2026-04-10T10:00:00Z",
  "updatedAt": "2026-04-10T10:00:00Z",
  "status": "draft",
  "originalScript": "{{original_script}}",
  "globalSettings": {
    "videoStyle": "{{style}}",
    "platform": "{{platform}}",
    "videoType": "{{video_type}}",
    "constantPrompt": "{{constant_prompt}}",
    "aspectRatio": "{{aspect_ratio}}",
    "targetDuration": {{target_duration}},
    "voiceover": {
      "enabled": {{enable_voiceover}},
      "voiceType": "{{voice_type}}"
    },
    "backgroundMusic": {
      "option": "{{music_option}}",
      "selectedTrack": {{selected_music}},
      "uploadedFileName": {{uploaded_music_name}}
    }
  },
  "scenes": [
    {
      "sceneId": "scene_001",
      "order": 1,
      "startTime": 0,
      "duration": <number: 5–12>,
      "text": "<natural spoken voiceover>",
      "tone": "<single word>",
      "mood": "<single word>",
      "voice": {
        "style": "{{voice_type}}",
        "audioUrl": null,
        "duration": <number: must exactly match scene duration>
      },
      "visual": {
        "prompt": "<cinematically specific, intelligently adapted prompt — see rules above>",
        "imageUrl": null,
        "animationType": "<one of the listed types — must differ from previous scene>",
        "animationSpeed": "slow | medium | fast"
      },
      "transition": "fade | slide | wipe | none"
    }
    /* more scenes */
  ],
  "finalOutput": {
    "videoUrl": null,
    "thumbnailUrl": null,
    "totalDuration": {{target_duration}},
    "renderedAt": null
  },
  "metadata": {
    "sceneCount": <number: total scenes>,
    "totalDuration": {{target_duration}},
    "wordCount": <number: total words across all scene text fields>,
    "estimatedRenderTimeSeconds": <number: sceneCount multiplied by 8>
  }
}
""" 
# Smart duration parser
def parse_duration(duration_str: str) -> int:
    if not duration_str:
        return 60  # default 60 seconds
    
    parts = duration_str.strip().lower().split()
    if not parts:
        return 60
    
    try:
        number = int(parts[0])
        
        # Check if unit is "minute" or "minutes"
        if len(parts) > 1 and any(word in parts[1] for word in ["minute", "min"]):
            return number * 60
        else:
            # Assume it's already in seconds
            return number
    except:
        return 60  # fallback





@router.post("/create-project")
async def create_project(payload: GenerateRequest):
    if not payload.script or not payload.script.strip():
        logger.warning("Received empty script in create_project request")
        raise HTTPException(status_code=400, detail="Script cannot be empty")

    # Convert duration
    target_duration = parse_duration(payload.duration)


    # === REPLACE PLACEHOLDERS ===
    filled_prompt = SYSTEM_PROMPT_TEMPLATE.replace("{{target_duration}}", str(target_duration)) \
        .replace("{{style}}", payload.style) \
        .replace("{{video_type}}", payload.video_type) \
        .replace("{{constant_prompt}}", payload.constant_prompt or "No additional visual instruction") \
        .replace("{{platform}}", payload.platform) \
        .replace("{{aspect_ratio}}", payload.aspect_ratio) \
        .replace("{{enable_voiceover}}", str(payload.enable_voiceover).lower()) \
        .replace("{{voice_type}}", payload.voice_type or "Female (Soft)") \
        .replace("{{music_option}}", payload.music_option) \
        .replace("{{original_script}}", payload.script[:1000])

    # Safe replacement for complex values
    selected_music_str = json.dumps(payload.selected_music) if payload.selected_music else "null"
    uploaded_music_str = json.dumps(payload.uploaded_music_name)

    filled_prompt = filled_prompt.replace("{{selected_music}}", selected_music_str)
    filled_prompt = filled_prompt.replace("{{uploaded_music_name}}", uploaded_music_str)

    # Groq API request body
    groq_payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": filled_prompt},
            {"role": "user", "content": "Generate the complete Pixnarr project JSON now."}
        ],
        "temperature": 0.7,
        "max_tokens": 7000,
        "response_format": {"type": "json_object"}
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}"
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            logger.info("Sending request to Groq API")
            response = await client.post(GROQ_URL, json=groq_payload, headers=headers)

            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Groq API error: {response.status_code} - {error_text}")
                raise HTTPException(status_code=502, detail=f"Groq API failed: {error_text}")

            result = response.json()
            raw_json = result["choices"][0]["message"]["content"].strip()

            project_data = json.loads(raw_json)

            # Safety: ensure projectId exists
            if "projectId" not in project_data or not project_data["projectId"]:
                project_data["projectId"] = f"pixnarr_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
            logger.info(f"Project created with ID: {project_data['projectId']}")
            return project_data

    except json.JSONDecodeError:
        logger.exception("Failed to decode JSON from Groq response: %s", response.text)
        raise HTTPException(status_code=500, detail="Groq returned invalid JSON")
    except Exception as e:
        logger.exception("Unhandled error in create_project: %s", e)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
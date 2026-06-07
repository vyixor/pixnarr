# backend/app/routes/media_browser.py
#
# Three endpoints that list files from the three media folders and
# serve them for in-browser playback / display.
#
# Folder layout (all siblings, matching render_video.py's OUTPUT_DIR):
#   backend/
#     rendered_videos/   ← .mp4 files
#     rendered_images/   ← .png / .jpg / .webp files
#     rendered_audios/   ← .mp3 / .wav files

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import preferences

import os
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

logger.info("Initializing media_browser route")

pref = preferences.Preferences()  # Initialize preferences (creates file if not exists)


router = APIRouter(prefix="/api/media")


FOLDERS = {
    "videos": pref.get("rendered_videos_path", None),
    "images": pref.get("rendered_images_path", None),
    "audios": pref.get("rendered_audios_path", None),
}

# Allowed extensions per category (lower-case)
EXTS = {
    "videos": {".mp4", ".mov", ".webm"},
    "images": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    "audios": {".mp3", ".wav", ".ogg", ".m4a"},
}

MIME = {
    ".mp4":  "video/mp4",
    ".mov":  "video/quicktime",
    ".webm": "video/webm",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif":  "image/gif",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".ogg":  "audio/ogg",
    ".m4a":  "audio/mp4",
}


def _list_folder(category: str) -> list[dict]:
    folder = FOLDERS[category]
    os.makedirs(folder, exist_ok=True)
    allowed = EXTS[category]
    items = []
    for name in sorted(os.listdir(folder), reverse=True):   # newest first
        ext = os.path.splitext(name)[1].lower()
        if ext not in allowed:
            continue
        path = os.path.join(folder, name)
        stat = os.stat(path)
        items.append({
            "filename":   name,
            "url":        f"/api/media/{category}/{name}",
            "sizeBytes":  stat.st_size,
            "sizeMb":     round(stat.st_size / 1024 / 1024, 2),
            "modifiedAt": stat.st_mtime,
        })
    return items


# ── List endpoints ────────────────────────────────────────────────────────────

@router.get("/videos")
def list_videos():
    if FOLDERS["videos"] is None:
        logger.error("rendered_videos_path not set in preferences.conf")
        raise HTTPException(500, "rendered_videos_path not set in preferences.conf")
    
    return {"success": True, "items": _list_folder("videos")}

@router.get("/images")
def list_images():
    if FOLDERS["images"] is None:
        logger.error("rendered_images_path not set in preferences.conf")
        raise HTTPException(500, "rendered_images_path not set in preferences.conf")
    
    return {"success": True, "items": _list_folder("images")}

@router.get("/audios")
def list_audios():
    if FOLDERS["audios"] is None:
        logger.error("rendered_audios_path not set in preferences.conf")
        raise HTTPException(500, "rendered_audios_path not set in preferences.conf")
    
    return {"success": True, "items": _list_folder("audios")}


# ── File-serve endpoints ──────────────────────────────────────────────────────

def _serve(category: str, filename: str) -> FileResponse:
    if FOLDERS[category] is None:
        logger.error(f"{category}_path not set in preferences.conf")
        raise HTTPException(500, f"{category}_path not set in preferences.conf")
    
    safe = os.path.basename(filename)          # prevent path traversal
    ext  = os.path.splitext(safe)[1].lower()
    if ext not in EXTS[category]:
        logger.warning(f"File type not allowed for {category}: {filename}")
        raise HTTPException(400, "File type not allowed")
    path = os.path.join(FOLDERS[category], safe)
    if not os.path.exists(path):
        logger.error(f"File not found: {path}")
        raise HTTPException(404, "File not found")
    return FileResponse(path, media_type=MIME.get(ext, "application/octet-stream"),
                        filename=safe)

@router.get("/videos/{filename}")
def serve_video(filename: str):
    return _serve("videos", filename)

@router.get("/images/{filename}")
def serve_image(filename: str):
    return _serve("images", filename)

@router.get("/audios/{filename}")
def serve_audio(filename: str):
    return _serve("audios", filename)

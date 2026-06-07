# backend/app/routes/render_video.py
#
# Two render modes:
#   POST /api/render-video        → all scenes merged into one final video
#   POST /api/render-video-scenes → each scene exported as its own .mp4
#
# Full voiceover support:
#   If the multipart upload contains a file named "full_voiceover.<ext>",
#   the backend splits it by each scene's duration using FFmpeg ss/t trim,
#   producing one per-scene audio segment. Per-scene voice files are ignored
#   entirely when a full voiceover is present.
#   If no full voiceover is present, per-scene voice files (voice_<sceneId>.*) 
#   are used as before.

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
import shutil, tempfile, os, json
from datetime import datetime
import subprocess
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

logger.info("Preferences initialized")
#try to check if our out_put directory is present if present use it else put the default there

rpath = pref.get("rendered_videos_path", None)
if rpath and os.path.isdir(rpath):
    OUTPUT_DIR = rpath
else:
    OUTPUT_DIR = os.path.join(Path.home(), "PixNarr", "rendered_videos")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    pref.set("rendered_videos_path", OUTPUT_DIR)
    
#check if ffmpeg is in system path if not check in ffmpeg_bin folder if available add to path for easy system access if not raise error 

FFMPEG_PATH = "ffmpeg_bin"


def _find_ffmpeg_executable() -> str:
    exe_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        logger.info("Using system ffmpeg: %s", system_ffmpeg)
        return system_ffmpeg

    bundle_dir = Path(__file__).resolve().parent / FFMPEG_PATH
    if bundle_dir.exists():
        candidate = bundle_dir / exe_name
        if candidate.is_file():
            os.environ["PATH"] = str(bundle_dir) + os.pathsep + os.environ.get("PATH", "")
            logger.info("Using bundled ffmpeg from %s", candidate)
            return str(candidate)

        for nested in bundle_dir.rglob(exe_name):
            if nested.is_file():
                os.environ["PATH"] = str(nested.parent) + os.pathsep + os.environ.get("PATH", "")
                logger.info("Using bundled ffmpeg from %s", nested)
                return str(nested)
    logger.error(f"ffmpeg executable not found. Checked system PATH and {FFMPEG_PATH} folder.")
    raise RuntimeError(
        "ffmpeg executable not found. Install ffmpeg or place it in the ffmpeg_bin folder."
    )

FFMPEG_BIN = _find_ffmpeg_executable()








SCENES_DIR = os.path.join(OUTPUT_DIR, "scenes")
os.makedirs(SCENES_DIR, exist_ok=True)

ASPECT_RATIO_MAP: dict[str, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "4:3":  (1440, 1080),
    "1:1":  (1080, 1080),
    "3:4":  (1080, 1440),
}

def _canvas(aspect_ratio: str) -> tuple[int, int]:
    return ASPECT_RATIO_MAP.get(aspect_ratio, (1920, 1080))

def _even(n: int) -> int:
    return n + (n % 2)


# ─────────────────────────────────────────────────────────────────────────────
# Video filter builder
# ─────────────────────────────────────────────────────────────────────────────
def _build_vf(anim: str, duration: float, W: int, H: int, fps: int = 25) -> str:
    if anim in ("static", "fade_out"):
        return (
            f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2,"
            f"setsar=1,fps={fps}"
        )
    if anim == "fade_in":
        return (
            f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2,"
            f"setsar=1,fps={fps},"
            f"fade=t=in:st=0:d=0.8"
        )
    if anim == "zoom_in":
        sw, sh = _even(int(W*1.30)), _even(int(H*1.30))
        ox, oy = f"({sw}-{W})/2", f"({sh}-{H})/2"
        return (
            f"scale={sw}:{sh}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x='{ox}*(1-min(t/{duration},1))':y='{oy}*(1-min(t/{duration},1))',"
            f"setsar=1,fps={fps}"
        )
    if anim == "zoom_out":
        sw, sh = _even(int(W*1.30)), _even(int(H*1.30))
        ox, oy = f"({sw}-{W})/2", f"({sh}-{H})/2"
        return (
            f"scale={sw}:{sh}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x='{ox}*min(t/{duration},1)':y='{oy}*min(t/{duration},1)',"
            f"setsar=1,fps={fps}"
        )
    if anim == "ken_burns":
        sw, sh = _even(int(W*1.35)), _even(int(H*1.35))
        return (
            f"scale={sw}:{sh}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x='({sw}-{W})*min(t/{duration},1)':y='({sh}-{H})*min(t/{duration},1)',"
            f"setsar=1,fps={fps}"
        )
    if anim == "pan_left":
        sw = _even(W * 2)
        return (
            f"scale={sw}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x='({sw}-{W})*(1-min(t/{duration},1))':y='(ih-{H})/2',"
            f"setsar=1,fps={fps}"
        )
    if anim == "pan_right":
        sw = _even(W * 2)
        return (
            f"scale={sw}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}:x='({sw}-{W})*min(t/{duration},1)':y='(ih-{H})/2',"
            f"setsar=1,fps={fps}"
        )
    # fallback
    return (
        f"scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2,"
        f"setsar=1,fps={fps}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Full voiceover splitter
# Splits the full_voiceover file into per-scene audio segments using
# each scene's startTime and duration from the project JSON.
# Returns a dict: sceneId → trimmed_audio_path
# ─────────────────────────────────────────────────────────────────────────────
def _split_full_voiceover(
    full_voice_path: str,
    scenes: list[dict],
    tmp_dir: str,
) -> dict[str, str]:
    """
    For each scene, extract the audio segment that corresponds to
    [startTime, startTime + duration] from the full voiceover file.
    Returns sceneId → path_to_trimmed_segment.
    """
    split_map: dict[str, str] = {}

    for scene in scenes:
        sid        = scene["sceneId"]
        start_time = float(scene.get("startTime", 0))
        duration   = max(float(scene.get("duration", 5)), 1.0)
        out_path   = os.path.join(tmp_dir, f"fv_segment_{sid}.aac")

        cmd = [
            FFMPEG_BIN, "-y",
            "-ss", str(start_time),           # seek to scene start
            "-t",  str(duration),             # take exactly scene duration
            "-i",  full_voice_path,
            "-acodec", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-ac", "2",
            out_path,
        ]

        r = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            split_map[sid] = out_path
            print(f"[full-voice] Segment for {sid}: {start_time}s → {start_time + duration}s")
            logger.info("[full-voice] Segment for %s: %ss → %ss", sid, start_time, start_time + duration)
        else:
            print(f"[full-voice] ⚠ Could not extract segment for {sid}: {r.stderr[-200:]}")
            logger.warning("[full-voice] ⚠ Could not extract segment for %s: %s", sid, r.stderr[-200:])

    return split_map


# ─────────────────────────────────────────────────────────────────────────────
# Save uploaded files + detect full voiceover
# Returns (image_map, voice_map, bg_music_path, full_voiceover_path)
# ─────────────────────────────────────────────────────────────────────────────
def _save_uploads(
    files: list[UploadFile],
    dest_dir: str,
) -> tuple[dict[str, str], dict[str, str], str | None, str | None]:
    image_map:      dict[str, str] = {}
    voice_map:      dict[str, str] = {}
    bg_music:       str | None     = None
    full_voiceover: str | None     = None

    for f in files:
        name = os.path.basename(f.filename or "unknown")
        dest = os.path.join(dest_dir, name)
        with open(dest, "wb") as buf:
            shutil.copyfileobj(f.file, buf)
        logger.info("[uploads] Saved upload %s -> %s", name, dest)

        stem = name.rsplit(".", 1)[0].lower()

        if name.startswith("image_"):
            image_map[name.rsplit(".", 1)[0]] = dest
        elif stem == "full_voiceover":
            # e.g. full_voiceover.mp3 or full_voiceover.wav
            full_voiceover = dest
            print(f"[uploads] Full voiceover detected: {name} "
                f"({os.path.getsize(dest)//1024} KB)")
            logger.info("[uploads] Full voiceover detected: %s (%s KB)", name, os.path.getsize(dest)//1024)
        elif name.startswith("voice_"):
            voice_map[name.rsplit(".", 1)[0]] = dest
        elif name == "background_music.mp3":
            bg_music = dest

    return image_map, voice_map, bg_music, full_voiceover


# ─────────────────────────────────────────────────────────────────────────────
# Resolve the voice path for a scene:
#   1. If a full-voiceover split map is provided, use that segment
#   2. Otherwise fall back to the per-scene voice_map entry
# ─────────────────────────────────────────────────────────────────────────────
def _resolve_voice(
    sid: str,
    full_voice_split: dict[str, str] | None,
    voice_map: dict[str, str],
) -> str | None:
    if full_voice_split:
        seg = full_voice_split.get(sid)          # may be None if segment failed
        logger.debug("Resolving voice for %s from full_voice_split: %s", sid, seg)
        return seg
    # Per-scene: try both common extensions
    v = voice_map.get(f"voice_{sid}")
    logger.debug("Resolving voice for %s from voice_map: %s", sid, v)
    return v


# ─────────────────────────────────────────────────────────────────────────────
# Build one scene → one .mp4 clip
# ─────────────────────────────────────────────────────────────────────────────
def _build_clip(
    scene: dict,
    image_path: str,
    voice_path: str | None,
    out_path: str,
    W: int,
    H: int,
) -> str:
    sid      = scene["sceneId"]
    duration = max(float(scene.get("duration", 5)), 1.0)
    anim     = scene.get("visual", {}).get("animationType", "static")
    fps      = 25

    vf = _build_vf(anim, duration, W, H, fps)

    logger.info("Building clip for %s — image=%s voice=%s duration=%s anim=%s", sid, image_path, voice_path, duration, anim)

    cmd = [FFMPEG_BIN, "-y", "-loop", "1", "-t", str(duration), "-i", image_path]

    if voice_path and os.path.exists(voice_path):
        cmd += ["-i", voice_path]
        audio_filter = (
            f"[1:a]atrim=duration={duration},"
            f"aresample=44100,asetpts=PTS-STARTPTS[aout]"
        )
    else:
        cmd += [
            "-f", "lavfi",
            "-i", f"aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration={duration}",
        ]
        audio_filter = "[1:a]asetpts=PTS-STARTPTS[aout]"

    cmd += [
        "-filter_complex", f"[0:v]{vf}[vout];{audio_filter}",
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-t", str(duration),
        out_path,
    ]

    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
    if r.returncode != 0:
        logger.error("Clip for %s failed: %s", sid, r.stderr[-800:])
        raise RuntimeError(f"Clip for {sid} failed:\n{r.stderr[-800:]}")

    logger.info("Built clip for %s -> %s", sid, out_path)
    return out_path


# ─────────────────────────────────────────────────────────────────────────────
# Mix in background music (optional, non-fatal)
# ─────────────────────────────────────────────────────────────────────────────
def _mix_bg_music(src: str, bg_music: str, out: str, duration: float | None = None) -> None:
    logger.info("Mixing background music %s into %s (duration=%s)", bg_music, src, duration)
    cmd = [
        FFMPEG_BIN, "-y",
        "-i", src,
        "-stream_loop", "-1", "-i", bg_music,
        "-filter_complex",
        "[0:a]volume=1.0[v];[1:a]volume=0.18[b];[v][b]amix=inputs=2:duration=first[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    ]
    if duration:
        cmd += ["-t", str(duration)]
    cmd += ["-shortest", out]
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
    if r.returncode != 0:
        logger.error("BG music mix failed: %s", r.stderr[-300:])
        raise RuntimeError(r.stderr[-300:])


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/render-video  — full merged video
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/api/render-video")
async def render_video(
    projectJson: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    try:
        project = json.loads(projectJson)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid project JSON: {e}")

    scenes = project.get("scenes", [])
    if not scenes:
        raise HTTPException(400, "Project has no scenes")

    aspect_ratio = project.get("globalSettings", {}).get("aspectRatio", "16:9")
    W, H = _canvas(aspect_ratio)
    print(f"[render-video] Canvas: {W}×{H}  ({aspect_ratio})")
    logger.info("[render-video] Canvas: %sx%s (%s)", W, H, aspect_ratio)

    with tempfile.TemporaryDirectory() as tmp:
        image_map, voice_map, bg_music, full_voiceover = _save_uploads(files, tmp)

        # ── Split full voiceover if provided ─────────────────────────────────
        full_voice_split: dict[str, str] | None = None
        if full_voiceover:
            print(f"[render-video] Splitting full voiceover into {len(scenes)} segments…")
            logger.info("[render-video] Splitting full voiceover into %s segments…", len(scenes))
            full_voice_split = _split_full_voiceover(full_voiceover, scenes, tmp)

        clips:  list[str] = []
        errors: list[str] = []

        for i, scene in enumerate(scenes):
            sid   = scene["sceneId"]
            img   = image_map.get(f"image_{sid}")
            voice = _resolve_voice(sid, full_voice_split, voice_map)

            if not img:
                print(f"[warn] No image for {sid} — skipping")
                logger.warning("No image for %s — skipping", sid)
                continue

            clip_path = os.path.join(tmp, f"clip_{i:03d}.mp4")
            try:
                clips.append(_build_clip(scene, img, voice, clip_path, W, H))
            except RuntimeError as e:
                errors.append(str(e))
                print(f"[error] {e}")
                logger.error("Error building clip for %s: %s", sid, e)

        if not clips:
            raise HTTPException(400, "No clips rendered. " + " | ".join(errors))

        # Concat
        concat_txt = os.path.join(tmp, "concat.txt")
        with open(concat_txt, "w") as f:
            for c in clips:
                f.write(f"file '{c}'\n")

        merged = os.path.join(tmp, "merged.mp4")
        r = subprocess.run(
            [FFMPEG_BIN, "-y", "-f", "concat", "-safe", "0", "-i", concat_txt, "-c", "copy", merged],
            capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if r.returncode != 0:
            logger.error("Concat failed: %s", r.stderr[-800:])
            raise HTTPException(500, f"Concat failed:\n{r.stderr[-800:]}")

        ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_name = f"pixnarr_{project.get('projectId', 'video')}_{ts}.mp4"
        final       = os.path.join(OUTPUT_DIR, output_name)

        if bg_music and os.path.exists(bg_music):
            try:
                _mix_bg_music(merged, bg_music, final)
            except RuntimeError as e:
                print(f"[warn] BG music mix failed, saving without it: {e}")
                logger.warning("BG music mix failed, saving without it: %s", e)
                shutil.copy(merged, final)
        else:
            shutil.copy(merged, final)

        if not os.path.exists(final) or os.path.getsize(final) == 0:
            logger.error("Output file is empty after render: %s", final)
            raise HTTPException(500, "Output file is empty after render")

        size_mb = round(os.path.getsize(final) / 1024 / 1024, 2)
        logger.info("Rendered final video saved: %s (%s MB)", final, size_mb)
        return {
            "success":         True,
            "filename":        output_name,
            "downloadUrl":     f"/api/download/{output_name}",
            "fileSizeMb":      size_mb,
            "resolution":      f"{W}×{H}",
            "aspectRatio":     aspect_ratio,
            "sceneCount":      len(clips),
            "skipped":         len(scenes) - len(clips),
            "usedFullVoice":   full_voiceover is not None,
            "message":         "Rendered and saved on server",
        }


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/render-video-scenes  — one .mp4 per scene
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/api/render-video-scenes")
async def render_video_scenes(
    projectJson: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    try:
        project = json.loads(projectJson)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid project JSON: {e}")

    scenes = project.get("scenes", [])
    if not scenes:
        raise HTTPException(400, "Project has no scenes")

    project_id   = project.get("projectId", "unknown")
    aspect_ratio = project.get("globalSettings", {}).get("aspectRatio", "16:9")
    W, H = _canvas(aspect_ratio)
    print(f"[render-scenes] Project: {project_id}  Canvas: {W}×{H}")
    logger.info("[render-scenes] Project: %s Canvas: %sx%s", project_id, W, H)

    ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
    project_dir = os.path.join(SCENES_DIR, f"{project_id}_{ts}")
    os.makedirs(project_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        image_map, voice_map, bg_music, full_voiceover = _save_uploads(files, tmp)

        # ── Split full voiceover if provided ─────────────────────────────────
        full_voice_split: dict[str, str] | None = None
        if full_voiceover:
            print(f"[render-scenes] Splitting full voiceover into {len(scenes)} segments…")
            logger.info("[render-scenes] Splitting full voiceover into %s segments…", len(scenes))
            full_voice_split = _split_full_voiceover(full_voiceover, scenes, tmp)

        rendered_scenes: list[dict] = []
        errors: list[str] = []

        for i, scene in enumerate(scenes):
            sid      = scene["sceneId"]
            order    = scene.get("order", i + 1)
            duration = max(float(scene.get("duration", 5)), 1.0)
            img      = image_map.get(f"image_{sid}")
            voice    = _resolve_voice(sid, full_voice_split, voice_map)

            if not img:
                print(f"[warn] No image for {sid} — skipping")
                logger.warning("No image for %s — skipping", sid)
                errors.append(f"Scene {order} ({sid}): no image uploaded")
                continue

            raw_clip = os.path.join(tmp, f"raw_{i:03d}.mp4")
            try:
                _build_clip(scene, img, voice, raw_clip, W, H)
            except RuntimeError as e:
                errors.append(str(e))
                print(f"[error] {e}")
                logger.error("Error building raw clip for scene %s: %s", sid, e)
                continue

            scene_filename = f"scene_{order:02d}_{sid}_{ts}.mp4"
            scene_final    = os.path.join(project_dir, scene_filename)

            if bg_music and os.path.exists(bg_music):
                try:
                    _mix_bg_music(raw_clip, bg_music, scene_final, duration)
                except RuntimeError as e:
                    print(f"[warn] BG music for scene {sid} failed: {e}")
                    logger.warning("BG music for scene %s failed: %s", sid, e)
                    shutil.copy(raw_clip, scene_final)
            else:
                shutil.copy(raw_clip, scene_final)

            if not os.path.exists(scene_final) or os.path.getsize(scene_final) == 0:
                errors.append(f"Scene {order}: output file empty")
                continue

            size_mb = round(os.path.getsize(scene_final) / 1024 / 1024, 2)
            rendered_scenes.append({
                "sceneId":     sid,
                "order":       order,
                "duration":    duration,
                "filename":    scene_filename,
                "downloadUrl": f"/api/download-scene/{project_id}_{ts}/{scene_filename}",
                "fileSizeMb":  size_mb,
            })
            print(f"[render-scenes] ✅ Scene {order}/{len(scenes)} — {scene_filename}")
            logger.info("[render-scenes] ✅ Scene %s/%s — %s", order, len(scenes), scene_filename)

        if not rendered_scenes:
            raise HTTPException(400, "No scene clips rendered. " + " | ".join(errors))

        return {
            "success":        True,
            "projectId":      project_id,
            "resolution":     f"{W}×{H}",
            "aspectRatio":    aspect_ratio,
            "totalScenes":    len(scenes),
            "renderedScenes": len(rendered_scenes),
            "skipped":        len(scenes) - len(rendered_scenes),
            "scenes":         rendered_scenes,
            "usedFullVoice":  full_voiceover is not None,
            "errors":         errors,
            "message":        f"{len(rendered_scenes)} scene videos saved to server",
        }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/download/{filename}
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/download/{filename}")
async def download_video(filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(OUTPUT_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(
        path, media_type="video/mp4", filename=safe,
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/download-scene/{folder}/{filename}
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/download-scene/{folder}/{filename}")
async def download_scene(folder: str, filename: str):
    safe_folder   = os.path.basename(folder)
    safe_filename = os.path.basename(filename)
    path = os.path.join(SCENES_DIR, safe_folder, safe_filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Scene file not found")
    return FileResponse(
        path, media_type="video/mp4", filename=safe_filename,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )

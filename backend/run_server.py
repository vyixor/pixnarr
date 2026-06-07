# backend/run_server.py
#
# Entry point compiled by Nuitka into pixnarr_backend.exe
# Nuitka uses __compiled__ instead of PyInstaller's sys.frozen
# and __nuitka_binary_dir__ instead of sys._MEIPASS

import sys
import os
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



# ── Detect whether we are running as a Nuitka-compiled binary ────────────────
IS_NUITKA = "__compiled__" in dir()          # True only in Nuitka build
IS_FROZEN = getattr(sys, 'frozen', False)    # True in PyInstaller (fallback)

if IS_NUITKA or IS_FROZEN:
    # --onefile extracts to a temp cache dir (sys.argv[0] is the real exe)
    # __file__ points to the extraction temp dir
    exe_dir      = os.path.dirname(os.path.abspath(sys.argv[0]))
    extract_dir  = os.path.dirname(os.path.abspath(__file__))
 
    logger.info(f"Exe dir:     {exe_dir}")
    logger.info(f"Extract dir: {extract_dir}")
 
    # Look for ffmpeg_bin in both locations
    ffmpeg_found = False
    for candidate in [
        os.path.join(extract_dir, 'ffmpeg_bin'),   # extraction temp dir (--onefile)
        os.path.join(exe_dir,     'ffmpeg_bin'),    # beside the exe
    ]:
        if os.path.isdir(candidate) and os.listdir(candidate):
            os.environ['PATH'] = candidate + os.pathsep + os.environ.get('PATH', '')
            logger.info(f"FFmpeg path set: {candidate}")
            ffmpeg_found = True
            break
 
    if not ffmpeg_found:
        logger.warning(f"ffmpeg_bin not found at {os.path.join(exe_dir, 'ffmpeg_bin')}")
 
    # Set working dir to beside the exe so rendered_videos/ etc. are created there
    os.chdir(exe_dir)
    logger.info(f"Working directory set: {exe_dir}")


pref = preferences.Preferences()  # Initialize preferences (creates file if not exists)
port = pref.get("APIPORT",None)
port = int(port) if port and port.isdigit() else None
import uvicorn

if __name__ == '__main__':
    
    if port is None:
        logger.warning("APIPORT not set in preferences.conf, using default 8080")
        print("[run_server] WARNING: PORT not set in preferences.conf, using default 8080")
        port = 8080  # default port
        pref.set("APIPORT", str(port))
    logger.info(f"Starting uvicorn on 127.0.0.1:{port}")
    print(f'[run_server] Starting uvicorn on 127.0.0.1:{port}')
    try:
        uvicorn.run(
            'app.main:app',
            host='127.0.0.1',
            port=port,
            log_level='info',
            timeout_keep_alive=120,  # increase keep-alive timeout
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        print(f"[run_server] ERROR: Failed to start server: {e}")

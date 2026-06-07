from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
# --- your existing route imports ---
from app.routes.create_project  import router as create_project_router
from app.routes.generate_image  import router as generate_image_router
from app.routes.render_video    import router as render_video_router
from app.routes.download_music  import router as download_music_router
from app.routes.media_browser   import router as media_browser_router
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

app = FastAPI(title='Pixnarr API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],        # Electron loads from file:// or localhost:3000
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(create_project_router)
app.include_router(generate_image_router)
app.include_router(render_video_router)
app.include_router(download_music_router)
app.include_router(media_browser_router)

# ── Health check — Electron polls this before opening the main window ─────────
@app.get('/health')
async def health():
    #do not log health check to avoid log spam, or log at debug level if needed
    #logger.info("Health check received")
    return {'status': 'ok', 'service': 'pixnarr-backend'}

# ── Startup log ───────────────────────────────────────────────────────────────
@app.on_event('startup')
async def on_startup():
    logger.info("Pixnarr backend started and ready")
    print('✅ Pixnarr backend started and ready')

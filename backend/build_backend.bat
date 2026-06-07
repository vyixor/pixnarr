@echo off
REM backend/build_backend.bat
REM
REM Run this from inside the backend/ folder with your venv activated:
REM   venv\Scripts\activate
REM   build_backend.bat
REM
REM Output: backend\dist\pixnarr_backend\pixnarr_backend.exe
REM ADD  --windows-console-mode=disable IN PRODUCTION TO HIDE CONSOLE , REMOVE FOR DEBUGGING

echo.
echo ========================================
echo  Pixnarr Backend — Nuitka Build (Win)
echo ========================================
echo.


REM ── Install Nuitka if not already installed ───────────────────────────────
pip install nuitka zstandard ordered-set

REM ── Run Nuitka ────────────────────────────────────────────────────────────
python -m nuitka ^
    --standalone ^
    --onefile ^
    --output-dir=dist ^
    --output-filename=pixnarr_backend.exe ^
    --remove-output ^
    --product-name=PixNarr-Studio ^
    --file-version=1.0.0.0 ^
    --product-version=1.0.0.0 ^
    --file-description="PixNarr Backend" ^
    --copyright="Copyright PixNarr. All Rights Reserved" ^
    --company-name=PixNarr ^
    --onefile-tempdir-spec={CACHE_DIR}/{COMPANY}/{PRODUCT}/{VERSION} ^
    --no-pyi-file ^
    --no-pyi-stubs ^
    --jobs=4 ^
    --windows-console-mode=disable ^
    --assume-yes-for-downloads ^
    --follow-imports ^
    --include-package=app ^
    --include-package=fastapi ^
    --include-package=uvicorn ^
    --include-package=uvicorn.lifespan ^
    --include-package=uvicorn.lifespan.on ^
    --include-package=uvicorn.protocols ^
    --include-package=uvicorn.protocols.http ^
    --include-package=uvicorn.protocols.websockets ^
    --include-package=uvicorn.loops ^
    --include-package=uvicorn.loops.asyncio ^
    --include-package=starlette ^
    --include-package=pydantic ^
    --include-package=pydantic.v1 ^
    --include-package=pydantic_core ^
    --include-package=httpx ^
    --include-package=httpcore ^
    --include-package=anyio ^
    --include-package=anyio._backends ^
    --include-package=h11 ^
    --include-package=dotenv ^
    --include-package=click ^
    --include-package=charset_normalizer ^
    --include-package=certifi ^
    --include-package=idna ^
    --include-module=anyio._backends._asyncio ^
    --include-module=anyio._backends._trio ^
    --include-module=uvicorn.logging ^
    --include-module=uvicorn.config ^
    --include-module=uvicorn.main ^
    --include-data-files=ffmpeg_bin/ffmpeg.exe=ffmpeg_bin/ffmpeg.exe ^
    --include-data-files=ffmpeg_bin/ffprobe.exe=ffmpeg_bin/ffprobe.exe ^
    --enable-plugin=anti-bloat ^
    run_server.py

echo.
if exist dist\pixnarr_backend.exe (
    echo ✅ Build successful!
    echo    Output: dist\pixnarr_backend.exe

) else (
    echo ❌ Build failed — check errors above
    exit /b 1
)
echo.
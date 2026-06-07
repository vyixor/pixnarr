@echo off
REM pixlayout/build_frontend.bat
REM
REM Bundles Next.js standalone + portable Node.js runtime.
REM No pkg needed — Node.js runs server_wrapper.js directly.
REM
REM Output: pixlayout\dist\frontend\
REM   node.exe            portable Node.js 18
REM   server_wrapper.js   entry point (fixes paths)
REM   server.js           Next.js standalone server
REM   .next\              compiled assets
REM   node_modules\       standalone node_modules
REM   public\             public folder
REM   start.bat           manual test launcher

echo.
echo ==========================================
echo  Pixnarr Frontend -- Build (Windows)
echo ==========================================
echo.

REM ── Step 1: Build Next.js standalone ─────────────────────────────────────
echo [1/4] Building Next.js standalone...
call npm run build:electron
if errorlevel 1 (
    echo [ERROR] Next.js build failed
    exit /b 1
)

REM ── Step 2: Merge static assets into standalone ───────────────────────────
echo [2/4] Merging static assets...
xcopy /E /I /Y ".next\static" ".next\standalone\.next\static" >nul
if exist public (
    xcopy /E /I /Y "public" ".next\standalone\public" >nul
)

REM ── Step 3: Copy server_wrapper.js into standalone ───────────────────────
echo [3/4] Copying server wrapper...
copy /Y "server_wrapper.js" ".next\standalone\server_wrapper.js" >nul

REM ── Step 4: Setup portable Node.js runtime ───────────────────────────────
echo [4/4] Setting up portable Node.js...

if not exist dist mkdir dist
if not exist dist\frontend mkdir dist\frontend

set NODE_ZIP=node18_portable.zip
set NODE_URL=https://nodejs.org/dist/v18.20.4/node-v18.20.4-win-x64.zip

if not exist %NODE_ZIP% (
    echo Downloading Node.js 18 portable runtime ~27MB...
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing"
    if errorlevel 1 (
        echo [ERROR] Download failed. Check internet connection.
        exit /b 1
    )
)

echo Extracting node.exe from zip...
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[System.IO.Compression.ZipFile]::OpenRead('%NODE_ZIP%'); $e=$zip.Entries | Where-Object {$_.Name -eq 'node.exe'} | Select-Object -First 1; if($e){ [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,'dist\frontend\node.exe',$true) }; $zip.Dispose()"
if not exist dist\frontend\node.exe (
    echo [ERROR] Could not extract node.exe
    exit /b 1
)

REM Copy entire standalone output into dist\frontend\
echo Copying standalone files to dist\frontend\...
xcopy /E /I /Y ".next\standalone" "dist\frontend" >nul

REM Create start.bat for manual testing (double-click to run without Electron)
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo set PORT=3000
    echo set HOSTNAME=127.0.0.1
    echo set NEXT_TELEMETRY_DISABLED=1
    echo node.exe server_wrapper.js
    echo pause
) > dist\frontend\start.bat

echo.
if exist dist\frontend\node.exe (
    echo [SUCCESS] Frontend bundle ready!
    echo    Folder: dist\frontend\
    echo    Launch: node.exe server_wrapper.js
    echo    Test:   double-click dist\frontend\start.bat
) else (
    echo [ERROR] Build incomplete
    exit /b 1
)
echo.

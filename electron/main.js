// electron/main.js
// Electron's ONLY job:
//   1. Start pixnarr_backend.exe (no env injection — it reads preferences.conf itself)
//   2. Start frontend via start.bat (exact same way user would double-click it)
//   3. Wait for both to respond, show splash, open window
//   4. On port change: recreate start.bat and restart frontend
//   5. On API key change: restart backend

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, exec } = require('child_process');
const path            = require('path');
const fs              = require('fs');
const http            = require('http');
const os              = require('os');

// ─────────────────────────────────────────────────────────────────────────────
// Preferences — embedded (no external require needed)
// ─────────────────────────────────────────────────────────────────────────────
class Preferences {
  constructor(filename = 'preferences.conf') {
    const configDir = path.join(os.homedir(), 'PixNarr');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    this.filepath = path.join(configDir, filename);
    this.data = {};
    this._load();
  }
  _load() {
    if (!fs.existsSync(this.filepath)) { this._save(); return; }
    try {
      for (const line of fs.readFileSync(this.filepath, 'utf-8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('//')) continue;
        if (t.includes('=')) {
          const [k, ...v] = t.split('=');
          if (k.trim()) this.data[k.trim()] = v.join('=').trim();
        }
      }
    } catch (e) { console.warn('[prefs] Load failed:', e.message); }
  }
  _save() {
    try {
      let c = '// PixNarr Preferences\n// Do not edit manually\n\n';
      for (const [k, v] of Object.entries(this.data)) c += `${k}=${v}\n`;
      fs.writeFileSync(this.filepath, c, 'utf-8');
    } catch (e) { console.error('[prefs] Save failed:', e.message); }
  }
  set(key, value)           { this.data[key.trim()] = String(value).trim(); this._save(); }
  get(key, def = '')        { return this.data[key.trim()] ?? def; }
  getInt(key, def = 0)      { const n = parseInt(this.get(key), 10); return isNaN(n) ? def : n; }
  getBool(key, def = false) { return ['true','1','yes','on'].includes(this.get(key).toLowerCase()); }
  remove(key)               { delete this.data[key.trim()]; this._save(); }
  all()                     { return { ...this.data }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config — all from preferences.conf
// ─────────────────────────────────────────────────────────────────────────────
const prefs = new Preferences('preferences.conf');

function getBackendPort()  { return prefs.getInt('APIPORT',       8080); }
function getFrontendPort() { return prefs.getInt('FRONTEND_PORT', 3000); }
function getWaitTimeout()  { return prefs.getInt('STARTUP_WAIT_SECONDS', 90); }

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────
function resPath(...parts) {
  if (app.isPackaged) return path.join(process.resourcesPath, ...parts);
  return path.join(__dirname, '..', ...parts);
}

const getBackendExe     = () => resPath('backend',  'pixnarr_backend.exe');
const getBackendLaunch  = () => resPath('backend',  'launch_backend.bat');
const getFrontendDir    = () => resPath('frontend');
const getStartBat       = () => resPath('frontend', 'start.bat');
const getNodeExe        = () => resPath('frontend', 'node.exe');
const getWrapperScript  = () => resPath('frontend', 'server_wrapper.js');

// ─────────────────────────────────────────────────────────────────────────────
// Recreate start.bat with current port from preferences
// Called on startup and whenever FRONTEND_PORT changes
// ─────────────────────────────────────────────────────────────────────────────
function writeStartBat() {
  const frontendDir = getFrontendDir();
  const port        = getFrontendPort();
  const startBat    = getStartBat();

  if (!fs.existsSync(frontendDir)) {
    console.warn('[frontend] Frontend dir not found:', frontendDir);
    return;
  }

  const content = [
    '@echo off',
    `cd /d "${frontendDir}"`,
    `set PORT=${port}`,
    'set HOSTNAME=127.0.0.1',
    'set NEXT_TELEMETRY_DISABLED=1',
    `"${getNodeExe()}" "${getWrapperScript()}"`,
    '',
  ].join('\r\n');

  fs.writeFileSync(startBat, content, 'utf-8');
  console.log(`[frontend] start.bat written → PORT=${port}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Process handles
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow        = null;
let backendProc       = null;
let frontendProc      = null;
let backendRestarting = false;

// ─────────────────────────────────────────────────────────────────────────────
// Start backend — just spawn the exe, no env injection
// backend reads preferences.conf itself for all config
// ─────────────────────────────────────────────────────────────────────────────
function startBackend() {
  if (!app.isPackaged) {
    console.log('[backend] Dev mode — run uvicorn manually');
    return;
  }
  if (backendProc) { console.log('[backend] Already running'); return; }

  const launchBat = getBackendLaunch();
  const backendDir = path.dirname(launchBat);

  if (!fs.existsSync(launchBat)) {
    // Fallback: try launching the exe directly if bat is missing
    const exe = getBackendExe();
    if (!fs.existsSync(exe)) {
      console.error('[backend] Neither launch_backend.bat nor exe found');
      dialog.showErrorBox('Pixnarr — Backend Missing',
        `Could not find backend launcher at:\n${launchBat}\n\nPlease reinstall.`);
      return;
    }
    console.warn('[backend] launch_backend.bat not found, falling back to direct exe');
    backendProc = spawn(exe, [], {
      cwd: backendDir, windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot, SystemDrive: process.env.SystemDrive,
        APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
        TEMP: process.env.TEMP, TMP: process.env.TMP, PATH: process.env.PATH,
        USERPROFILE: process.env.USERPROFILE, USERNAME: process.env.USERNAME,
        COMPUTERNAME: process.env.COMPUTERNAME,
      },
    });
  } else {
    console.log('[backend] Starting via launch_backend.bat:', launchBat);
    // Run launch_backend.bat via cmd.exe — sets correct cwd before starting exe
    backendProc = spawn('cmd.exe', ['/c', launchBat], {
      cwd: backendDir,
      windowsHide: true,
      env: {
        SystemRoot:   process.env.SystemRoot,
        SystemDrive:  process.env.SystemDrive,
        APPDATA:      process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        TEMP:         process.env.TEMP,
        TMP:          process.env.TMP,
        PATH:         process.env.PATH,
        USERPROFILE:  process.env.USERPROFILE,
        USERNAME:     process.env.USERNAME,
        COMPUTERNAME: process.env.COMPUTERNAME,
      },
    });
  }

  backendProc.stdout?.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProc.stderr?.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProc.on('error', e  => { console.error('[backend] Spawn error:', e.message); backendProc = null; });
  backendProc.on('close', c  => { console.log('[backend] Exited with code', c); backendProc = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Start frontend — run start.bat using cmd.exe (exact same as double-clicking)
// ─────────────────────────────────────────────────────────────────────────────
function startFrontend() {
  if (!app.isPackaged) {
    console.log('[frontend] Dev mode — run npm run dev manually');
    return;
  }
  if (frontendProc) { console.log('[frontend] Already running'); return; }

  // Always write a fresh start.bat with current port before launching
  writeStartBat();

  const startBat = getStartBat();
  if (!fs.existsSync(startBat)) {
    console.error('[frontend] start.bat not found:', startBat);
    return;
  }

  console.log('[frontend] Starting via start.bat');

  // Use cmd.exe /c to run start.bat — identical to double-clicking it
  frontendProc = spawn('cmd.exe', ['/c', startBat], {
    cwd:         getFrontendDir(),
    windowsHide: true,
    env: {
      ...process.env,   // node.exe needs full PATH to find system DLLs
      PORT:                    String(getFrontendPort()),
      HOSTNAME:                '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  frontendProc.stdout?.on('data', d => console.log('[frontend]', d.toString().trim()));
  frontendProc.stderr?.on('data', d => console.error('[frontend]', d.toString().trim()));
  frontendProc.on('error', e  => { console.error('[frontend] Spawn error:', e.message); frontendProc = null; });
  frontendProc.on('close', c  => { console.log('[frontend] Exited with code', c); frontendProc = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop + restart frontend (e.g. after port change)
// ─────────────────────────────────────────────────────────────────────────────
function restartFrontend() {
  if (!app.isPackaged) return;

  const doStart = () => {
    writeStartBat();   // recreate with new port
    startFrontend();
  };

  if (frontendProc) {
    frontendProc.once('close', () => { frontendProc = null; setTimeout(doStart, 500); });
    // Kill the cmd.exe process tree (node.exe is a child of cmd.exe)
    exec(`taskkill /pid ${frontendProc.pid} /T /F`, () => {});
  } else {
    setTimeout(doStart, 300);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop + restart backend (e.g. after API key change)
// ─────────────────────────────────────────────────────────────────────────────
function restartBackend() {
  if (!app.isPackaged) {
    console.log('[backend] Dev mode — restart uvicorn manually');
    return;
  }
  if (backendRestarting) return;
  backendRestarting = true;

  const doStart = () => { backendRestarting = false; startBackend(); };

  if (backendProc) {
    backendProc.once('close', () => { backendProc = null; setTimeout(doStart, 500); });
    // Kill entire process tree (cmd.exe + pixnarr_backend.exe child)
    exec(`taskkill /pid ${backendProc.pid} /T /F`, () => {});
  } else {
    setTimeout(doStart, 300);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll until server responds — timeout from preferences.conf
// ─────────────────────────────────────────────────────────────────────────────
function waitForServer(url, label) {
  const totalSeconds  = getWaitTimeout();  // e.g. STARTUP_WAIT_SECONDS=90
  const intervalMs    = 1500;
  const maxRetries    = Math.ceil((totalSeconds * 1000) / intervalMs);
  const initialDelay  = 2000;

  console.log(`[electron] Waiting for ${label} (up to ${totalSeconds}s)…`);

  return new Promise((resolve, reject) => {
    let attempts = 0;

    setTimeout(() => {
      const check = () => {
        const req = http.get(url, { timeout: 2000 }, res => {
          if (res.statusCode < 500) {
            console.log(`[electron] ${label} ready ✓ (attempt ${attempts + 1})`);
            resolve();
          } else {
            retry();
          }
        });
        req.on('error',   () => retry());
        req.on('timeout', () => { req.destroy(); retry(); });
      };

      const retry = () => {
        attempts++;
        if (attempts >= maxRetries) {
          return reject(new Error(
            `${label} did not respond within ${totalSeconds} seconds.\n` +
            `URL: ${url}`
          ));
        }
        if (attempts % 8 === 0) {
          console.log(`[electron] Still waiting for ${label} (${Math.round(attempts * intervalMs / 1000)}s elapsed)…`);
        }
        setTimeout(check, intervalMs);
      };

      check();
    }, initialDelay);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create main window
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280, height:  800,
    minWidth: 900, minHeight: 600,
    title:           'Pixnarr',
    backgroundColor: '#07080a',
    icon:            path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const url = `http://localhost:${getFrontendPort()}`;
  console.log('[electron] Loading:', url);
  mainWindow.loadURL(url);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Splash screen — shown while servers start
// ─────────────────────────────────────────────────────────────────────────────
function createSplash() {
  const win = new BrowserWindow({
    width:           400,
    height:          260,
    frame:           false,
    resizable:       false,
    center:          true,
    alwaysOnTop:     true,
    backgroundColor: '#07080a',
    webPreferences:  { nodeIntegration: false, contextIsolation: true },
  });

  // Write splash HTML to a temp file to avoid data: URI encoding issues
  const splashHtml = path.join(os.tmpdir(), 'pixnarr_splash.html');
  fs.writeFileSync(splashHtml, `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#07080a; color:#fff;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    height:100vh; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    user-select:none;
  }
  .icon  { font-size:2.8rem; margin-bottom:10px; }
  .title { font-size:1.5rem; font-weight:700; letter-spacing:4px; margin-bottom:8px;
           background:linear-gradient(135deg,#00e5a0,#00b4ff);
           -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .msg   { font-size:0.78rem; color:#666; margin-bottom:28px; min-height:18px; }
  .track { width:200px; height:3px; background:#1a1a1a; border-radius:4px; overflow:hidden; }
  .bar   { height:100%; width:0%; border-radius:4px;
           background:linear-gradient(90deg,#00e5a0,#00b4ff);
           transition:width 0.5s ease; }
</style></head>
<body>
  <div class="icon">&#128253;</div>
  <div class="title">PIXNARR</div>
  <div class="msg" id="msg">Starting services&hellip;</div>
  <div class="track"><div class="bar" id="bar"></div></div>
  <script>
    let w = 0;
    setInterval(() => {
      w = Math.min(w + 1.2, 88);
      document.getElementById('bar').style.width = w + '%';
    }, 250);
  </script>
</body></html>`, 'utf-8');

  win.loadFile(splashHtml);
  return win;
}

function updateSplash(win, msg) {
  console.log('[electron]', msg);
  win?.webContents?.executeJavaScript(
    `document.getElementById('msg').textContent = ${JSON.stringify(msg)};`
  ).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => ({
  GROQ_API_KEY:          prefs.get('GROQ_API_KEY'),
  WORKER_AI_ACCOUNT_API: prefs.get('WORKER_AI_ACCOUNT_API'),
  backendPort:           prefs.getInt('APIPORT',              8080),
  frontendPort:          prefs.getInt('FRONTEND_PORT',        3000),
  startupWaitSeconds:    prefs.getInt('STARTUP_WAIT_SECONDS', 90),
}));

ipcMain.handle('settings:save', (_e, data) => {
  const oldBackendPort  = prefs.getInt('APIPORT',        8080);
  const oldFrontendPort = prefs.getInt('FRONTEND_PORT',  3000);

  prefs.set('GROQ_API_KEY',           data.GROQ_API_KEY          || '');
  prefs.set('WORKER_AI_ACCOUNT_API',  data.WORKER_AI_ACCOUNT_API || '');
  prefs.set('APIPORT',                data.backendPort           || 8080);
  prefs.set('FRONTEND_PORT',          data.frontendPort          || 3000);
  prefs.set('STARTUP_WAIT_SECONDS',   data.startupWaitSeconds    || 90);

  // Restart backend if API keys changed (port change requires full app restart)
  const keysChanged = (data.GROQ_API_KEY !== prefs.get('GROQ_API_KEY')) ||
                      (data.WORKER_AI_ACCOUNT_API !== prefs.get('WORKER_AI_ACCOUNT_API'));

  const backendPortChanged  = data.backendPort  !== oldBackendPort;
  const frontendPortChanged = data.frontendPort !== oldFrontendPort;

  if (keysChanged || backendPortChanged) restartBackend();
  if (frontendPortChanged) restartFrontend();

  return { ok: true };
});

ipcMain.handle('settings:validate', () => {
  const missing = [];
  if (!prefs.get('GROQ_API_KEY'))          missing.push('GROQ_API_KEY');
  if (!prefs.get('WORKER_AI_ACCOUNT_API')) missing.push('WORKER_AI_ACCOUNT_API');
  return { valid: missing.length === 0, missing };
});

ipcMain.handle('dialog:saveFile', async (_e, { defaultName, filters } = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'pixnarr_video.mp4',
    filters:     filters     || [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return result.canceled ? null : result.filePath;
});

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (app.isPackaged) {
    const splash = createSplash();

    // Ensure STARTUP_WAIT_SECONDS is saved in preferences if not already set
    if (!prefs.get('STARTUP_WAIT_SECONDS')) {
      prefs.set('STARTUP_WAIT_SECONDS', '90');
    }

    updateSplash(splash, 'Starting backend...');
    startBackend();

    updateSplash(splash, 'Starting frontend...');
    startFrontend();

    try {
      updateSplash(splash, 'Waiting for backend...');
      await waitForServer(
        `http://127.0.0.1:${getBackendPort()}/health`,
        'Backend'
      );

      updateSplash(splash, 'Waiting for frontend...');
      await waitForServer(
        `http://127.0.0.1:${getFrontendPort()}`,
        'Frontend'
      );

      updateSplash(splash, 'Ready!');
      await new Promise(r => setTimeout(r, 400));  // brief pause so "Ready!" is visible

    } catch (err) {
      console.error('[electron] Startup failed:', err.message);
      splash.close();
      dialog.showErrorBox(
        'Pixnarr — Startup Failed',
        err.message + '\n\nTip: You can increase the startup wait time in Settings.'
      );
      app.quit();
      return;
    }

    splash.close();

  } else {
    console.log('[electron] Dev mode — ensure uvicorn + npm run dev are running');
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProc)  { backendProc.kill();  backendProc  = null; }
  if (frontendProc) {
    exec(`taskkill /pid ${frontendProc.pid} /T /F`, () => {});
    frontendProc = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProc)  { backendProc.kill();  backendProc  = null; }
  if (frontendProc) {
    exec(`taskkill /pid ${frontendProc.pid} /T /F`, () => {});
    frontendProc = null;
  }
});
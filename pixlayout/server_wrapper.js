// pixlayout/server_wrapper.js
//
// Entry point launched by: node.exe server_wrapper.js
// Fixes the chdir issue in Next.js standalone server.js
// and sets correct paths for the portable runtime.

const path = require('path');
const fs   = require('fs');

// __dirname is the folder containing this file (= dist/frontend/ at runtime)
const runtimeDir = __dirname;

console.log('[frontend] Runtime dir:', runtimeDir);

// ── Patch process.chdir BEFORE requiring server.js ─────────────────────────
// server.js tries to chdir to its original build path which doesn't
// exist on the user's machine. We intercept and redirect it.
const _chdir = process.chdir.bind(process);
process.chdir = (dir) => {
  if (!dir || dir.includes('.next') || dir.includes('standalone')) {
    // Redirect to our actual runtime directory
    try { _chdir(runtimeDir); } catch(e) {}
    return;
  }
  try { _chdir(dir); } catch(e) {}
};

// ── Set required environment variables ─────────────────────────────────────
process.env.PORT                    = process.env.PORT     || '3000';
process.env.HOSTNAME                = process.env.HOSTNAME || '127.0.0.1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

console.log(`[frontend] Starting on ${process.env.HOSTNAME}:${process.env.PORT}`);

// ── Start the Next.js standalone server ────────────────────────────────────
require('./server.js');

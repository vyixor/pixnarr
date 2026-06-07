'use client';

import { useEffect, useState } from 'react';
import { Save, CheckCircle, AlertCircle, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';

// window.pixnarr type is declared globally in types/electron.d.ts

export default function SettingsPage() {
  const [groqKey,            setGroqKey]            = useState('');
  const [workerApi,          setWorkerApi]          = useState('');
  const [port,               setPort]               = useState('8080');
  const [frontendPort,       setFrontendPort]       = useState('3000');
  const [startupWaitSeconds, setStartupWaitSeconds] = useState('90');

  const [showGroq,      setShowGroq]      = useState(false);
  const [showWorker,    setShowWorker]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [isElectron,    setIsElectron]    = useState(false);
  const [loadingPrefs,  setLoadingPrefs]  = useState(true);

  // ── Load settings from Electron main process on mount ─────────────────────
  // window.pixnarr is injected by preload.js (runs in Node.js context).
  // Preferences are read from ~/PixNarr/preferences.conf on the user's machine.
  // This is the ONLY way to read them — never import Preferences directly
  // in a Next.js page because fs/path/os don't exist in the browser.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.pixnarr?.isElectron) {
      setIsElectron(true);

      window.pixnarr.getSettings()
        .then((s: any) => {
          setGroqKey(s.GROQ_API_KEY           || '');
          setWorkerApi(s.WORKER_AI_ACCOUNT_API || '');
          setPort(String(s.backendPort         || 8080));
          setFrontendPort(String(s.frontendPort || 3000));
          setStartupWaitSeconds(String(s.startupWaitSeconds || 90));
        })
        .catch((e: any) => {
          console.error('[settings] Failed to load preferences:', e);
          setError('Could not load saved settings.');
        })
        .finally(() => setLoadingPrefs(false));
    } else {
      // Running in browser (dev without Electron) — nothing to load
      setLoadingPrefs(false);
    }
  }, []);

  // ── Save settings back to preferences.conf via IPC ────────────────────────
  const handleSave = async () => {
    if (!window.pixnarr) return;

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      setError('Port must be a number between 1024 and 65535');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await window.pixnarr.saveSettings({
        GROQ_API_KEY:          groqKey.trim(),
        WORKER_AI_ACCOUNT_API: workerApi.trim(),
        backendPort:           portNum,
        frontendPort:          parseInt(frontendPort, 10) || 3000,
        startupWaitSeconds:    parseInt(startupWaitSeconds, 10) || 90,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (e: any) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Not running inside Electron ───────────────────────────────────────────
  if (!isElectron && !loadingPrefs) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-zinc-400 mb-2">Settings are only available in the desktop app.</p>
          <p className="text-zinc-600 text-sm">
            Running in browser mode — use a <code className="text-zinc-400">.env</code> file in your backend folder instead.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading prefs ─────────────────────────────────────────────────────────
  if (loadingPrefs) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  // ── Main settings UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-2xl mx-auto">

        <h1 className="text-3xl font-bold mb-1">Settings</h1>
        <p className="text-zinc-500 text-sm mb-10">
          Your API keys are saved locally on your machine — never sent anywhere else.
        </p>

        <div className="space-y-8">

          {/* ── Groq API Key ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-base">Groq API Key</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Used for script-to-project generation via Llama 3.3
                </p>
              </div>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 shrink-0 ml-4"
              >
                Get key <ExternalLink size={12} />
              </a>
            </div>
            <div className="relative">
              <input
                type={showGroq ? 'text' : 'password'}
                value={groqKey}
                onChange={e => setGroqKey(e.target.value)}
                placeholder="gsk_…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 pr-12 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 font-mono"
              />
              <button
                onClick={() => setShowGroq(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                title={showGroq ? 'Hide' : 'Show'}
              >
                {showGroq ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* ── Cloudflare Workers AI ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-base">Cloudflare Workers AI</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Format: <code className="text-zinc-300">ACCOUNT_ID.API_KEY</code> — multiple accounts comma-separated
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  e.g. <code className="text-zinc-400">abc123.key1,def456.key2</code>
                </p>
              </div>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 shrink-0 ml-4"
              >
                Get key <ExternalLink size={12} />
              </a>
            </div>
            <div className="relative">
              <textarea
                value={workerApi}
                onChange={e => setWorkerApi(e.target.value)}
                placeholder="accountId.apiKey,accountId2.apiKey2"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 pr-12 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 font-mono resize-none"
              />
              <button
                onClick={() => setShowWorker(v => !v)}
                className="absolute right-3 top-3 text-zinc-400 hover:text-white"
                title={showWorker ? 'Hide' : 'Show'}
              >
                {showWorker ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* ── Backend port ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <h2 className="font-semibold text-base mb-1">Backend Port</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Port for the Python FastAPI backend. Saved as <code className="text-zinc-300">APIPORT</code>. Default: 8080.
            </p>
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              min="1024"
              max="65535"
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 font-mono"
            />
          </div>

          {/* ── Frontend port ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <h2 className="font-semibold text-base mb-1">Frontend Port</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Port for the Next.js frontend server. Saved as <code className="text-zinc-300">FRONTEND_PORT</code>. Default: 3000.
            </p>
            <input
              type="number"
              value={frontendPort}
              onChange={e => setFrontendPort(e.target.value)}
              min="1024"
              max="65535"
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 font-mono"
            />
          </div>

          {/* ── Startup wait time ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <h2 className="font-semibold text-base mb-1">Startup Wait Time</h2>
            <p className="text-xs text-zinc-500 mb-4">
              How many seconds Pixnarr waits for backend and frontend to start before showing an error.
              Saved as <code className="text-zinc-300">STARTUP_WAIT_SECONDS</code>. Default: 90.
              Increase this on slower machines.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={startupWaitSeconds}
                onChange={e => setStartupWaitSeconds(e.target.value)}
                min="30"
                max="300"
                className="w-32 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 font-mono"
              />
              <span className="text-xs text-zinc-500">seconds</span>
            </div>
          </div>

          {/* ── Save button + feedback ── */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-emerald-500 disabled:opacity-40 text-black font-semibold rounded-2xl transition-opacity"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" /> Saving…</>
                : <><Save size={18} /> Save Settings</>
              }
            </button>

            {saved && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle size={18} /> Saved — backend restarting with new keys
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={18} /> {error}
              </div>
            )}
          </div>

          {/* ── Info box ── */}
          <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-2xl text-xs text-zinc-500 leading-relaxed">
            <p className="font-medium text-zinc-400 mb-2">ℹ Where are my keys stored?</p>
            <p>
              Saved to{' '}
              <code className="text-zinc-300">C:\Users\YourName\PixNarr\preferences.conf</code>{' '}
              as a plain text file — human-readable, no database. Keys are never uploaded anywhere.
              They are only passed to the local Python backend process running on your own computer.
            </p>
            <p className="mt-2">
              You can open and edit this file manually if needed. Format is <code className="text-zinc-300">KEY=value</code>, one per line.
              Lines starting with <code className="text-zinc-300">//</code> are comments.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
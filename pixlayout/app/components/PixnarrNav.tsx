'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Settings, Home,
} from 'lucide-react';

// window.pixnarr type is declared globally in types/electron.d.ts

// ── Route label map — shown in the breadcrumb ─────────────────────────────
const ROUTE_LABELS: Record<string, string> = {
  '/':              'Home',
  '/create':        'Create Video',
  '/imageprocess':  'Process Scenes',
  '/settings':      'Settings',
  '/gallery':       'Gallery',
};

function getLabel(pathname: string): string {
  // Exact match first
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  // Partial match (e.g. /imageprocess?projectId=...)
  for (const [route, label] of Object.entries(ROUTE_LABELS)) {
    if (pathname.startsWith(route) && route !== '/') return label;
  }
  return 'Pixnarr';
}

export default function PixnarrNav() {
  const router   = useRouter();
  const pathname = usePathname();

  const [canGoBack,    setCanGoBack]    = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isMaximized,  setIsMaximized]  = useState(false);
  const [keysValid,    setKeysValid]    = useState<boolean | null>(null);
  const [isElectron,   setIsElectron]   = useState(false);

  // ── Detect Electron + validate keys on mount ───────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && window.pixnarr?.isElectron) {
      setIsElectron(true);
      window.pixnarr.validateSettings().then(({ valid }) => setKeysValid(valid));
    }
  }, []);

  // ── Track browser history availability ────────────────────────────────
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
    setCanGoForward(false); // browser doesn't expose forward state — reset on nav
  }, [pathname]);

  const goBack    = useCallback(() => router.back(),    [router]);
  const goForward = useCallback(() => router.forward(), [router]);
  const goHome    = useCallback(() => router.push('/'), [router]);

  const isOnSettings = pathname === '/settings';
  const isOnHome     = pathname === '/';

  // ── Page label for breadcrumb ──────────────────────────────────────────
  const pageLabel = getLabel(pathname);

  return (
    <nav className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/60 select-none">
      <div className="flex items-center gap-2 px-4 h-12">

        {/* ── Left: back / forward / home ─────────────────────────────── */}
        <div className="flex items-center gap-0.5">
          <NavIconBtn
            onClick={goBack}
            disabled={!canGoBack}
            title="Go back"
          >
            <ChevronLeft size={18} />
          </NavIconBtn>

          <NavIconBtn
            onClick={goForward}
            disabled={!canGoForward}
            title="Go forward"
          >
            <ChevronRight size={18} />
          </NavIconBtn>

          <NavIconBtn
            onClick={goHome}
            disabled={isOnHome}
            title="Home"
          >
            <Home size={16} />
          </NavIconBtn>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />

        {/* ── Breadcrumb ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-zinc-600 text-xs font-medium tracking-wide">
            Pixnarr
          </span>
          <ChevronRight size={12} className="text-zinc-700 shrink-0" />
          <span className="text-zinc-300 text-xs font-medium truncate">
            {pageLabel}
          </span>
        </div>

        {/* ── Spacer ──────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── API keys warning badge ──────────────────────────────────── */}
        {isElectron && keysValid === false && !isOnSettings && (
          <button
            onClick={() => router.push('/settings')}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg text-amber-400 text-xs font-medium transition-colors"
            title="API keys not configured — click to go to Settings"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            Setup required
          </button>
        )}

        {/* ── Right: settings ─────────────────────────────────────────── */}
        <NavIconBtn
          onClick={() => router.push('/settings')}
          disabled={isOnSettings}
          title="Settings"
          active={isOnSettings}
        >
          <Settings size={16} className={isOnSettings ? 'text-cyan-400' : ''} />
        </NavIconBtn>

      </div>
    </nav>
  );
}

// ── Small reusable icon button ─────────────────────────────────────────────
function NavIconBtn({
  children, onClick, disabled, title, active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        w-8 h-8 flex items-center justify-center rounded-lg transition-all
        ${disabled
          ? 'text-zinc-700 cursor-not-allowed'
          : active
            ? 'text-cyan-400 bg-zinc-800'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70'
        }
      `}
    >
      {children}
    </button>
  );
}
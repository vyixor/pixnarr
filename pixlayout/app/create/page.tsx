'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, X, Music, Upload, Video, Image, Headphones, Download, Loader2, RefreshCw } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

const API = 'http://localhost:8080';

// IndexedDB store for persisting uploaded background music across page navigation
const DB_NAME        = 'PixnarrDB';
const DB_VERSION     = 2;
const BG_MUSIC_STORE = 'bgMusic';
const BG_MUSIC_KEY   = 'uploaded_bg_music';

// ─────────────────────────────────────────────────────────────────────────────
// Media panel types
// ─────────────────────────────────────────────────────────────────────────────
type MediaPanel = 'videos' | 'gallery' | 'audio' | null;

interface MediaItem {
  filename: string;
  url: string;
  sizeMb: number;
  modifiedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable media drawer hook
// ─────────────────────────────────────────────────────────────────────────────
function useMediaPanel(category: 'videos' | 'images' | 'audios') {
  const [items, setItems]     = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API}/api/media/${category}`);
      const data = await res.json();
      if (data.success) setItems(data.items);
      else throw new Error(data.error || 'Failed to load');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  return { items, loading, error, load };
}

// ─────────────────────────────────────────────────────────────────────────────
// Videos panel
// ─────────────────────────────────────────────────────────────────────────────
function VideosPanel({ onClose }: { onClose: () => void }) {
  const { items, loading, error, load } = useMediaPanel('videos');
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  return (
    <MediaShell
      title="My Videos"
      icon={<Video size={22} className="text-cyan-400" />}
      count={items.length}
      loading={loading}
      error={error}
      onClose={onClose}
      onRefresh={load}
      emptyText="No rendered videos yet. Create your first video!"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {items.map(item => (
          <div key={item.filename} className="bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-colors">
            <video
              src={`${API}${item.url}`}
              controls
              className="w-full aspect-video object-cover bg-black"
              onPlay={() => setPlaying(item.filename)}
              onPause={() => setPlaying(null)}
            />
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate text-zinc-200">{item.filename}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{item.sizeMb} MB · {formatDate(item.modifiedAt)}</p>
              </div>
              <a
                href={`${API}${item.url}`}
                download={item.filename}
                className="shrink-0 p-2 bg-zinc-700 hover:bg-cyan-400 hover:text-zinc-950 rounded-xl transition-colors"
                title="Download"
              >
                <Download size={16} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </MediaShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery panel
// ─────────────────────────────────────────────────────────────────────────────
function GalleryPanel({ onClose }: { onClose: () => void }) {
  const { items, loading, error, load } = useMediaPanel('images');
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <MediaShell
        title="Image Gallery"
        icon={<Image size={22} className="text-violet-400" />}
        count={items.length}
        loading={loading}
        error={error}
        onClose={onClose}
        onRefresh={load}
        emptyText="No generated images yet. Images are saved here as they're created."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map(item => (
            <div
              key={item.filename}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-zinc-700 hover:border-violet-400 cursor-pointer transition-all"
              onClick={() => setLightbox(item)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API}${item.url}`}
                alt={item.filename}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                <p className="text-xs text-white truncate w-full">{item.filename}</p>
              </div>
            </div>
          ))}
        </div>
      </MediaShell>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API}${lightbox.url}`}
              alt={lightbox.filename}
              className="w-full rounded-2xl shadow-2xl"
            />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">{lightbox.filename}</p>
                <p className="text-xs text-zinc-500">{lightbox.sizeMb} MB · {formatDate(lightbox.modifiedAt)}</p>
              </div>
              <div className="flex gap-3">
                <a
                  href={`${API}${lightbox.url}`}
                  download={lightbox.filename}
                  className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Download size={15} /> Download
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio panel
// ─────────────────────────────────────────────────────────────────────────────
function AudioPanel({ onClose }: { onClose: () => void }) {
  const { items, loading, error, load } = useMediaPanel('audios');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { load(); }, [load]);

  const toggle = (item: MediaItem) => {
    if (!audioRef.current) return;
    if (playing === item.filename) {
      audioRef.current.pause();
      setPlaying(null);
    } else {
      audioRef.current.src = `${API}${item.url}`;
      audioRef.current.play().catch(console.error);
      setPlaying(item.filename);
    }
  };

  return (
    <MediaShell
      title="Audio Library"
      icon={<Headphones size={22} className="text-emerald-400" />}
      count={items.length}
      loading={loading}
      error={error}
      onClose={onClose}
      onRefresh={load}
      emptyText="No audio files yet. Select tracks from the music library to save them here."
    >
      <div className="space-y-3">
        {items.map(item => {
          const isPlaying = playing === item.filename;
          return (
            <div
              key={item.filename}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                isPlaying
                  ? 'border-emerald-400/60 bg-emerald-400/5'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
              }`}
            >
              <button
                onClick={() => toggle(item)}
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isPlaying ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-700 hover:bg-emerald-400 hover:text-zinc-950'
                }`}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{item.filename}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{item.sizeMb} MB · {formatDate(item.modifiedAt)}</p>
                {isPlaying && (
                  <div className="mt-2 flex gap-0.5 items-end h-4">
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-emerald-400 rounded-full"
                        style={{
                          height: `${30 + Math.sin(i * 1.2) * 60}%`,
                          animation: `bounce ${0.5 + i * 0.05}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <a
                href={`${API}${item.url}`}
                download={item.filename}
                className="shrink-0 p-2.5 bg-zinc-700 hover:bg-emerald-400 hover:text-zinc-950 rounded-xl transition-colors"
                title="Download"
              >
                <Download size={15} />
              </a>
            </div>
          );
        })}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
    </MediaShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────────────────────
function MediaShell({
  title, icon, count, loading, error, onClose, onRefresh, emptyText, children,
}: {
  title: string; icon: React.ReactNode; count: number;
  loading: boolean; error: string | null;
  onClose: () => void; onRefresh: () => void;
  emptyText: string; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="text-xl font-semibold">{title}</h2>
            {!loading && (
              <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full text-xs font-mono">
                {count} file{count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Loading files…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-red-400">
              <p className="text-sm font-medium">Failed to load: {error}</p>
              <button onClick={onRefresh} className="px-4 py-2 bg-zinc-800 rounded-xl text-sm hover:bg-zinc-700 transition-colors text-white">
                Try again
              </button>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-500">
              <p className="text-sm">{emptyText}</p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          from { transform: scaleY(1); }
          to   { transform: scaleY(0.3); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const isSupportedAudioFile = (filename: string): boolean => {
  if (!filename) return false;
  return ['.mp3', '.wav', '.ogg', '.m4a'].some(ext => filename.toLowerCase().endsWith(ext));
};


// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function PixNarrActionPage() {
  // Core States
  const [script, setScript]                     = useState('');
  const [charCount, setCharCount]               = useState(0);
  const [style, setStyle]                       = useState('Cinematic');
  const [platform, setPlatform]                 = useState('YouTube Shorts');
  const [videoType, setVideoType]               = useState('Storytelling');
  const [constantPrompt, setConstantPrompt]     = useState('');
  const [constantCharCount, setConstantCharCount] = useState(0);
  const [aspectRatio, setAspectRatio]           = useState('16:9');
  const [duration, setDuration]                 = useState('60 seconds');
  const [isGenerating, setIsGenerating]         = useState(false);

  // Intelligence Settings
  const [enableVoiceover, setEnableVoiceover]   = useState(true);
  const [voiceType, setVoiceType]               = useState('Female (Soft)');
  const [musicOption, setMusicOption]           = useState<'none' | 'upload' | 'library'>('library');
  const [uploadedMusic, setUploadedMusic]       = useState<File | null>(null);
  const [selectedMusic, setSelectedMusic]       = useState<any>(null);
  const [showMusicModal, setShowMusicModal]     = useState(false);
  const [searchTerm, setSearchTerm]             = useState('');
  const [playingTrackId, setPlayingTrackId]     = useState<number | null>(null);

  // Nav panel
  const [activePanel, setActivePanel] = useState<MediaPanel>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  //const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── IndexedDB: persist uploaded bg music across page navigation ────────────
  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains('images'))       db.createObjectStore('images');
        if (!db.objectStoreNames.contains('voices'))       db.createObjectStore('voices');
        if (!db.objectStoreNames.contains(BG_MUSIC_STORE)) db.createObjectStore(BG_MUSIC_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }, []);

  const saveBgMusicToDB = useCallback(async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl = e.target?.result as string;
          const base64  = dataUrl.split(',')[1];
          const db      = await openDB();
          const tx      = db.transaction(BG_MUSIC_STORE, 'readwrite');
          tx.objectStore(BG_MUSIC_STORE).put(
            JSON.stringify({ base64, filename: file.name }),
            BG_MUSIC_KEY
          );
          tx.oncomplete = () => { console.log('[bgMusic] Saved to IndexedDB:', file.name); resolve(); };
          tx.onerror    = () => reject(tx.error);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, [openDB]);

  const clearBgMusicFromDB = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(BG_MUSIC_STORE, 'readwrite');
      tx.objectStore(BG_MUSIC_STORE).delete(BG_MUSIC_KEY);
    } catch { /* non-fatal */ }
  }, [openDB]);

  const styles = [
    'Anime', '3D Render', '2D Illustration', 'Cinematic', 'Realistic', 'Cartoon',
    'Watercolor', 'Oil Painting', 'Sketch', 'Pixel Art', 'Futuristic', 'Cyberpunk',
    'Minimalist', 'Comic Book', 'Claymation', 'Low Poly', 'Neon Glow', 'Vintage Film',
    'Dark Moody', 'Fantasy Art', 'Abstract', 'Matte Painting', 'Storybook',
  ];

  const platforms  = ['TikTok Style', 'YouTube', 'YouTube Shorts', 'Instagram Reels', 'Facebook Video'];
  const durations  = ['30 seconds', '60 seconds','2 minutes','3 minutes', '5 minutes'];

  const aspectOptions = [
    { value: '16:9', label: '16:9', desc: 'Landscape' },
    { value: '9:16', label: '9:16', desc: 'Vertical' },
    { value: '4:3',  label: '4:3',  desc: 'Classic' },
    { value: '1:1',  label: '1:1',  desc: 'Square' },
    { value: '3:4',  label: '3:4',  desc: 'Portrait' },
  ];

  const musicLibrary = [
    { id: 1,  name: "SoundHelix Cinematic",      duration: "6:13", genre: "Cinematic",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { id: 2,  name: "SoundHelix Electronic",     duration: "5:45", genre: "Electronic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
    { id: 3,  name: "SoundHelix Ambient",        duration: "4:55", genre: "Ambient",       previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
    { id: 4,  name: "SoundHelix Futuristic",     duration: "5:30", genre: "Futuristic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
    { id: 5,  name: "SoundHelix Dark Moody",     duration: "6:02", genre: "Dark Moody",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
    { id: 6,  name: "SoundHelix Corporate",      duration: "5:10", genre: "Corporate",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
    { id: 7,  name: "SoundHelix Inspirational",  duration: "4:40", genre: "Inspirational", previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
    { id: 8,  name: "SoundHelix Motivational",   duration: "5:25", genre: "Motivational",  previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" },
    { id: 9,  name: "SoundHelix Cinematic 2",    duration: "6:08", genre: "Cinematic",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3" },
    { id: 10, name: "SoundHelix Electronic 2",   duration: "5:50", genre: "Electronic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3" },
    { id: 11, name: "SoundHelix Ambient 2",      duration: "4:35", genre: "Ambient",       previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3" },
    { id: 12, name: "SoundHelix Futuristic 2",   duration: "5:40", genre: "Futuristic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3" },
    { id: 13, name: "SoundHelix Dark Moody 2",   duration: "6:15", genre: "Dark Moody",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3" },
    { id: 14, name: "SoundHelix Corporate 2",    duration: "5:20", genre: "Corporate",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3" },
    { id: 15, name: "SoundHelix Inspirational 2",duration: "4:50", genre: "Inspirational", previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3" },
    { id: 16, name: "SoundHelix Motivational 2", duration: "5:55", genre: "Motivational",  previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3" },
    { id: 17, name: "SoundHelix Cinematic 3",    duration: "6:05", genre: "Cinematic",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3" },
    { id: 18, name: "SoundHelix Electronic 3",   duration: "5:35", genre: "Electronic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-18.mp3" },
    { id: 19, name: "Epic Adventure",            duration: "2:45", genre: "Cinematic",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { id: 20, name: "Calm Reflection",           duration: "3:12", genre: "Ambient",       previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
    { id: 21, name: "Energy Surge",              duration: "2:30", genre: "Motivational",  previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" },
    { id: 22, name: "Mysterious Night",          duration: "2:15", genre: "Dark",          previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
    { id: 23, name: "Corporate Success",         duration: "2:05", genre: "Corporate",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
    { id: 24, name: "Dreamy Horizon",            duration: "3:40", genre: "Ambient",       previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3" },
    { id: 25, name: "Heroic Journey",            duration: "4:10", genre: "Cinematic",     previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3" },
    { id: 26, name: "Future Pulse",              duration: "2:58", genre: "Futuristic",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3" },
    { id: 27, name: "Warm Memories",             duration: "3:25", genre: "Inspirational", previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3" },
    { id: 28, name: "Intense Buildup",           duration: "3:50", genre: "Dark Moody",    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3" },
  ];

  const filteredMusic = musicLibrary.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.genre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (v.length <= 4000) { setScript(v); setCharCount(v.length); }
  };

  const handleConstantPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (v.length <= 500) { setConstantPrompt(v); setConstantCharCount(v.length); }
  };

  const togglePreview = (track: any) => {
    if (playingTrackId === track.id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.previewUrl;
        audioRef.current.play().catch(console.error);
        setPlayingTrackId(track.id);
      }
    }
  };

  const selectTrack = (track: any) => {
    setSelectedMusic(track);
    setShowMusicModal(false);
    setPlayingTrackId(null);
    if (audioRef.current) audioRef.current.pause();
  };

  const handleGenerate = async () => {
    if (!script.trim()) { alert('Please enter a script before generating.'); return; }
    setIsGenerating(true);

    const payload = {
      script,
      style,
      platform,
      video_type: videoType,
      constant_prompt: constantPrompt.trim() || null,
      aspect_ratio: aspectRatio,
      duration,
      enable_voiceover: enableVoiceover,
      voice_type: enableVoiceover ? voiceType : null,
      music_option: musicOption,
      selected_music: selectedMusic
        ? { name: selectedMusic.name, genre: selectedMusic.genre, preview_url: selectedMusic.previewUrl }
        : null,
      uploaded_music_name: uploadedMusic?.name || null,
    };

    try {
      const res = await fetch(`${API}/api/create-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text() || 'Failed to create project');
      const result = await res.json();
      console.log('✅ Pixnarr Project Created:', result);
      alert(`🎉 Project created!\nProject ID: ${result.projectId}\nScenes: ${result.metadata?.sceneCount || 0}`);
      localStorage.setItem('currentPixnarrProject', JSON.stringify(result));
      window.location.href = `/imageprocess?projectId=${result.projectId}`;
    } catch (err: any) {
      console.error('❌ Generate Error:', err);
      alert(`❌ ${err.message || 'Something went wrong. Is the backend running on port 8080?'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Nav link config
  const navLinks: { label: string; panel: MediaPanel; icon: React.ReactNode; color: string }[] = [
    { label: 'My Videos', panel: 'videos',  icon: <Video size={15} />,      color: 'hover:text-cyan-400' },
    { label: 'Gallery',   panel: 'gallery', icon: <Image size={15} />,      color: 'hover:text-violet-400' },
    { label: 'Audio',     panel: 'audio',   icon: <Headphones size={15} />, color: 'hover:text-emerald-400' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Top Navigation ── */}
      <nav className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-cyan-400 to-violet-500 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold">
              📽️
            </div>
            <span className="font-semibold text-2xl sm:text-3xl tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              PixNarr
            </span>
          </div>

          {/* Nav links — My Videos | Gallery | Audio */}
          <div className="hidden md:flex items-center gap-x-1">
            {navLinks.map(({ label, panel, icon, color }) => (
              <button
                key={panel}
                onClick={() => setActivePanel(panel)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium text-zinc-400 ${color} hover:bg-zinc-800/60 transition-all ${activePanel === panel ? 'text-white bg-zinc-800' : ''}`}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-x-2 bg-zinc-900 rounded-3xl pl-2 pr-4 py-1 border border-zinc-700">
            <UserAvatar />
          </div>
        </div>
      </nav>

      {/* ── Media panels ── */}
      {activePanel === 'videos'  && <VideosPanel  onClose={() => setActivePanel(null)} />}
      {activePanel === 'gallery' && <GalleryPanel onClose={() => setActivePanel(null)} />}
      {activePanel === 'audio'   && <AudioPanel   onClose={() => setActivePanel(null)} />}

      {/* ── Page body (unchanged from original) ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-10">
        <div className="mb-8 md:mb-10">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter text-center md:text-left">
            Create Video
          </h1>
          <p className="text-zinc-400 mt-2 text-base md:text-lg text-center md:text-left">
            Paste your script. Our AI will turn it into a stunning video.
          </p>
        </div>

        {/* Script Input */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-3">
            <label className="text-lg font-medium">Your Script</label>
            <div className="text-sm font-mono text-zinc-400 tabular-nums">{charCount} / 4,000</div>
          </div>
          <textarea
            value={script}
            onChange={handleScriptChange}
            placeholder="Paste your script here… The AI will turn it into a full video"
            className="w-full h-64 md:h-80 resize-none bg-zinc-900 border border-zinc-700 focus:border-cyan-400 rounded-3xl px-5 md:px-8 py-6 text-base md:text-lg leading-relaxed placeholder-zinc-500 focus:outline-none focus:ring-4 focus:ring-cyan-400/10 transition-all shadow-xl"
          />
        </div>

        {/* Configuration Panel */}
        <div className="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6">⚙️ Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 md:gap-8">

            {/* Style */}
            <div className="lg:col-span-5">
              <label className="block text-sm font-medium text-zinc-400 mb-3">🎨 Visual Style</label>
              <select value={style} onChange={e => setStyle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-3xl px-6 py-4 text-base md:text-lg focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 transition-all">
                {styles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Platform */}
            <div className="lg:col-span-4">
              <label className="block text-sm font-medium text-zinc-400 mb-3">📱 Target Platform</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-3xl px-6 py-4 text-base md:text-lg focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 transition-all">
                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Constant Prompt */}
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                🧠 Constant Prompt <span className="text-xs text-zinc-500">(all scenes)</span>
              </label>
              <textarea value={constantPrompt} onChange={handleConstantPromptChange}
                placeholder="e.g. same character, dark lighting, futuristic city…"
                className="w-full h-28 md:h-32 resize-none bg-zinc-950 border border-zinc-700 rounded-3xl px-6 py-5 text-base focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 transition-all"
              />
              <div className="text-right text-xs font-mono text-zinc-400 mt-1">{constantCharCount} / 500</div>
            </div>

            {/* Aspect Ratio */}
            <div className="lg:col-span-12">
              <label className="block text-sm font-medium text-zinc-400 mb-4">📐 Aspect Ratio</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 md:gap-4">
                {aspectOptions.map(opt => {
                  const active = aspectRatio === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setAspectRatio(opt.value)}
                      className={`relative flex flex-col items-center justify-center rounded-3xl border py-4 px-2 transition-all duration-200 ${active ? 'border-cyan-400 bg-zinc-950 shadow-xl shadow-cyan-400/20' : 'border-zinc-700 hover:border-zinc-400 bg-zinc-950'}`}>
                      <div className="text-xl md:text-2xl font-semibold mb-1">{opt.label}</div>
                      <div className="text-xs text-zinc-500">{opt.desc}</div>
                      {active && <div className="absolute top-3 right-3 w-5 h-5 bg-cyan-400 text-zinc-950 rounded-full flex items-center justify-center text-xs font-bold">✓</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration */}
            <div className="lg:col-span-12">
              <label className="block text-sm font-medium text-zinc-400 mb-3">⏱ Video Duration</label>
              <div className="flex flex-wrap gap-3">
                {durations.map(d => (
                  <button key={d} onClick={() => setDuration(d)}
                    className={`flex-1 min-w-[110px] py-5 rounded-3xl border text-base font-medium transition-all ${duration === d ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-zinc-700 hover:border-zinc-400'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Video Intelligence Settings */}
        <div className="mt-8 bg-zinc-900/70 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-2xl">
          <h2 className="text-xl font-semibold mb-6">🎬 Video Intelligence Settings</h2>
          <div className="space-y-10">

            {/* Video Type */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">🎥 Video Type</label>
              <select value={videoType} onChange={e => setVideoType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-3xl px-6 py-4 text-base focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10">
                {['Educational','Storytelling','Motivational','Manga','Documentary','Explainer','Tutorial','Horror','Comedy','Cinematic Trailer','News Style','Interview Style','Podcast Visual','Inspirational','Business Promo','Product Showcase','Social Media Hook','Kids Content','Sci-Fi Narrative','Fantasy Story','Historical','Case Study','Vlog Style','AI Generated Art Style','Minimal Explainer'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Voiceover */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-zinc-400">🎙 Enable Voiceover</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={enableVoiceover} onChange={() => setEnableVoiceover(!enableVoiceover)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-cyan-400 transition-colors" />
                </label>
              </div>
              {enableVoiceover && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['Male','Female','Boy','Girl','Child','Male (Warm)','Female (Soft)','Deep Voice','Energetic','Calm/Narrative','Robotic','AI Neutral'].map(v => (
                    <button key={v} onClick={() => setVoiceType(v)}
                      className={`py-4 rounded-3xl border text-sm transition-all ${voiceType === v ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-zinc-700 hover:border-zinc-400'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Background Music */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-4">🎵 Background Music</label>
              <div className="flex flex-wrap gap-3">
                {[{ value: 'none', label: 'None' }, { value: 'upload', label: 'Upload from file' }, { value: 'library', label: 'Select from library' }].map(opt => (
                  <button key={opt.value} onClick={() => {
                    setMusicOption(opt.value as any);
                    // If switching away from upload, wipe the stored file
                    if (opt.value !== 'upload') {
                      setUploadedMusic(null);
                      clearBgMusicFromDB();
                    }
                  }}
                    className={`flex-1 py-5 rounded-3xl border text-base font-medium transition-all ${musicOption === opt.value ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-zinc-700 hover:border-zinc-400'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {musicOption === 'upload' && (
                <div className="mt-6 border border-dashed border-zinc-600 rounded-3xl p-8 text-center">
                  <Upload className="mx-auto mb-4 text-zinc-400" size={36} />
                  <label className="cursor-pointer px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-3xl inline-block">
                    Choose MP3 / WAV
                    <input
                      type="file"
                      accept=".mp3,.wav"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadedMusic(file);
                        // Save to IndexedDB so the imageprocess page can use it
                        try { await saveBgMusicToDB(file); }
                        catch (err) { console.error('[bgMusic] Failed to save to IndexedDB:', err); }
                      }}
                      className="hidden"
                    />
                  </label>
                  {uploadedMusic && (
                    <p className="mt-4 text-emerald-400">
                      {isSupportedAudioFile(uploadedMusic.name)
                        ? `✅ Saved: ${uploadedMusic.name}`
                        : `${uploadedMusic.name} — Not Supported`}
                    </p>
                  )}
                </div>
              )}

              {musicOption === 'library' && (
                <button onClick={() => setShowMusicModal(true)}
                  className="mt-4 w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-3xl flex items-center justify-center gap-2 text-sm font-medium">
                  <Music size={18} /> Browse Royalty-Free Library
                </button>
              )}

              {selectedMusic && musicOption === 'library' && (
                <div className="mt-4 p-4 bg-zinc-800 rounded-3xl flex justify-between items-center">
                  <div>
                    <p className="font-medium">Selected: {selectedMusic.name}</p>
                    <p className="text-xs text-zinc-500">{selectedMusic.genre} • Royalty-free</p>
                  </div>
                  <button onClick={() => setSelectedMusic(null)} className="text-red-400 text-sm">Remove</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-10 md:mt-12 flex justify-center pb-12">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !script.trim()}
            className="w-full max-w-md md:max-w-lg py-7 md:py-8 text-2xl md:text-3xl font-semibold rounded-3xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 text-zinc-950 shadow-2xl shadow-cyan-400/30 hover:shadow-cyan-400/50 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-x-4"
          >
            {isGenerating ? (
              <><div className="w-6 h-6 border-4 border-zinc-950 border-t-transparent animate-spin rounded-full" /> Generating your video...</>
            ) : (
              <>🚀 Generate Video</>
            )}
          </button>
        </div>
      </div>

      {/* Music Library Modal */}
      {showMusicModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-zinc-700 flex items-center justify-between">
              <h3 className="text-2xl font-semibold">Royalty-Free Music Library</h3>
              <button onClick={() => { setShowMusicModal(false); setPlayingTrackId(null); }} className="text-zinc-400 hover:text-white">
                <X size={28} />
              </button>
            </div>
            <div className="p-6 border-b border-zinc-700">
              <input type="text" placeholder="Search cinematic, motivational, ambient..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-3xl px-6 py-4 focus:border-cyan-400 outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {filteredMusic.map(track => (
                <div key={track.id} className="flex items-center gap-4 p-5 bg-zinc-800 rounded-3xl hover:bg-zinc-700 transition-all">
                  <button onClick={() => togglePreview(track)}
                    className="w-12 h-12 bg-zinc-700 hover:bg-cyan-400 rounded-2xl flex items-center justify-center transition-colors">
                    {playingTrackId === track.id ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <div className="flex-1">
                    <p className="font-medium">{track.name}</p>
                    <p className="text-xs text-zinc-500">{track.duration} • {track.genre} • Royalty-free</p>
                  </div>
                  <button onClick={() => selectTrack(track)}
                    className="px-6 py-3 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 rounded-3xl text-sm font-semibold transition-colors">
                    Select
                  </button>
                </div>
              ))}
              {filteredMusic.length === 0 && <p className="text-center py-10 text-zinc-400">No matching tracks found.</p>}
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingTrackId(null)} className="hidden" />
    </div>
  );
}
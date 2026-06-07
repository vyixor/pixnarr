'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { MoreHorizontal, Upload, RefreshCw, Loader2, CheckCircle, Download, ImagePlus, Mic, X, ChevronDown, Film, Scissors } from 'lucide-react';

const DB_NAME    = 'PixnarrDB';
const DB_VERSION = 2;
const IMAGE_STORE   = 'images';
const VOICE_STORE   = 'voices';
const BG_MUSIC_STORE = 'bgMusic';
const BG_MUSIC_KEY   = 'uploaded_bg_music';
const API_BASE   = 'http://localhost:8080';

const aspectRatioMap: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720,  height: 1280 },
  '4:3':  { width: 1280, height: 960 },
  '1:1':  { width: 1024, height: 1024 },
  '3:4':  { width: 960,  height: 1280 },
};

// Helper function
const getDimensions = (aspectRatio: string) => {
  return aspectRatioMap[aspectRatio] || { width: 1280, height: 720 }; // fallback
};


export default function ImageProcessPage() {
  const [project, setProject]           = useState<any>(null);
  const [scenesStatus, setScenesStatus] = useState<Record<string, any>>({});
  const [modalScene, setModalScene]     = useState<any>(null);
  const [modalData, setModalData]       = useState<any>(null);
  const [hasChanges, setHasChanges]     = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Render state
  const [isRendering, setIsRendering]       = useState(false);
  const [renderStatus, setRenderStatus]     = useState<string>('');
  const [renderError, setRenderError]       = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl]       = useState<string | null>(null);   // server URL
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [fileSizeMb, setFileSizeMb]         = useState<number | null>(null);
  const [imageWidth, setImageWidth]         = useState<number | null>(null);
  const [imageHeight, setImageHeight]       = useState<number | null>(null);

  // ── Full voiceover ─────────────────────────────────────────────────────────
  const [fullVoiceFile, setFullVoiceFile]         = useState<File | null>(null);
  const [fullVoiceBase64, setFullVoiceBase64]     = useState<string | null>(null);
  const [fullVoiceBlobUrl, setFullVoiceBlobUrl]   = useState<string | null>(null);

  // ── Scene videos result (for "Create Video Scenes" mode) ──────────────────
  const [sceneResults, setSceneResults]           = useState<any[]>([]);
  const [scenesRenderInfo, setScenesRenderInfo]   = useState<string>('');

  // ── Render dropdown ────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ═══════════════════════════════════════════════════════
  // IndexedDB helpers
  // ═══════════════════════════════════════════════════════

  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains(IMAGE_STORE))    db.createObjectStore(IMAGE_STORE);
        if (!db.objectStoreNames.contains(VOICE_STORE))    db.createObjectStore(VOICE_STORE);
        if (!db.objectStoreNames.contains(BG_MUSIC_STORE)) db.createObjectStore(BG_MUSIC_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }, []);

  const saveBase64 = useCallback(async (store: string, key: string, b64: string) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(b64, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }, [openDB]);

  const getBase64 = useCallback(async (store: string, key: string): Promise<string | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror   = () => reject(req.error);
    });
  }, [openDB]);

  const getBlobUrl = useCallback(async (store: string, key: string, mime: string): Promise<string | null> => {
    const b64 = await getBase64(store, key);
    if (!b64) return null;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  }, [getBase64]);

  // Read uploaded background music saved by the create-project page
  const getUploadedBgMusic = useCallback(async (): Promise<{ base64: string; filename: string } | null> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(BG_MUSIC_STORE, 'readonly');
        const req = tx.objectStore(BG_MUSIC_STORE).get(BG_MUSIC_KEY);
        req.onsuccess = () => {
          if (!req.result) { resolve(null); return; }
          try { resolve(JSON.parse(req.result as string)); }
          catch { resolve(null); }
        };
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  }, [openDB]);

  // ═══════════════════════════════════════════════════════
  // Load project on mount
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    const saved = localStorage.getItem('currentPixnarrProject');
    if (!saved) return;
    let parsed: any;
    try { parsed = JSON.parse(saved); } catch { return; }

    setProject(parsed);
    if (parsed){
    let aspectRatio = parsed.globalSettings?.aspectRatio || '16:9';
    const { width, height } = getDimensions(aspectRatio);
    setImageWidth(width);
    setImageHeight(height);

  }
      
    (async () => {
      const status: Record<string, any> = {};
      for (const scene of parsed.scenes) {
        const img   = await getBlobUrl(IMAGE_STORE, `image_${scene.sceneId}`, 'image/png');
        const voice = await getBlobUrl(VOICE_STORE, `voice_${scene.sceneId}`, 'audio/wav');
        status[scene.sceneId] = { loading: false, image: img, voice, completed: !!img };
      }
      setScenesStatus(status);
    })();

    generateMissingImages(parsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════════════
  // Image generation
  // ═══════════════════════════════════════════════════════
  const generateMissingImages = async (proj: any) => {
    for (const scene of proj.scenes) {
      if (await getBase64(IMAGE_STORE, `image_${scene.sceneId}`)) continue;
      await generateSingleImage(scene);
      await new Promise(r => setTimeout(r, 1600));
    }
  };

  const generateSingleImage = async (scene: any) => {
    const sid = scene.sceneId;
    setScenesStatus(p => ({ ...p, [sid]: { ...p[sid], loading: true } }));
    try {
      const res  = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: scene.visual.prompt, width: imageWidth, height: imageHeight, sceneId: sid }),
      });
      const data = await res.json();
      if (data.success && data.imageBase64) {
        await saveBase64(IMAGE_STORE, `image_${sid}`, data.imageBase64);
        const url = await getBlobUrl(IMAGE_STORE, `image_${sid}`, 'image/png');
        setScenesStatus(p => ({ ...p, [sid]: { loading: false, image: url, completed: true } }));
      }
    } catch (e) {
      console.error(e);
      setScenesStatus(p => ({ ...p, [sid]: { ...p[sid], loading: false } }));
    }
  };

  // ═══════════════════════════════════════════════════════
  // Background music download
  // ═══════════════════════════════════════════════════════
  const downloadBgMusic = async (url: string): Promise<Blob | null> => {
    try {
      const res  = await fetch(`${API_BASE}/api/download-music`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_url: url }),
      });
      const data = await res.json();
      if (!data.success || !data.audioBase64) return null;
      const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
      return new Blob([bytes], { type: 'audio/mp3' });
    } catch { return null; }
  };

  // ═══════════════════════════════════════════════════════
  // Full voiceover handlers
  // ═══════════════════════════════════════════════════════
  const handleFullVoiceUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setFullVoiceBase64(dataUrl.split(',')[1]);
      setFullVoiceFile(file);
      setFullVoiceBlobUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const clearFullVoice = () => {
    setFullVoiceFile(null);
    setFullVoiceBase64(null);
    if (fullVoiceBlobUrl) URL.revokeObjectURL(fullVoiceBlobUrl);
    setFullVoiceBlobUrl(null);
  };

  // ═══════════════════════════════════════════════════════
  // Shared FormData builder (used by both render modes)
  // ═══════════════════════════════════════════════════════
  const buildFormData = async (onStatus: (s: string) => void): Promise<FormData> => {
    const fd = new FormData();
    fd.append('projectJson', JSON.stringify(project));

    // Images
    onStatus('Preparing images…');
    for (const scene of project.scenes) {
      const b64 = await getBase64(IMAGE_STORE, `image_${scene.sceneId}`);
      if (b64) {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        fd.append('files', new Blob([bytes], { type: 'image/png' }), `image_${scene.sceneId}.png`);
      }
    }

    // ── Voiceover: full takes priority over per-scene ──────────────────────
    if (fullVoiceBase64 && fullVoiceFile) {
      onStatus('Attaching full voiceover…');
      const isMP3 = fullVoiceFile.type.includes('mpeg') || fullVoiceFile.name.endsWith('.mp3');
      const ext   = isMP3 ? 'mp3' : 'wav';
      const mime  = isMP3 ? 'audio/mpeg' : 'audio/wav';
      const bytes = Uint8Array.from(atob(fullVoiceBase64), c => c.charCodeAt(0));
      // Filename MUST start with "full_voiceover" so the backend detects it
      fd.append('files', new Blob([bytes], { type: mime }), `full_voiceover.${ext}`);
    } else {
      onStatus('Preparing voice tracks…');
      for (const scene of project.scenes) {
        const b64 = await getBase64(VOICE_STORE, `voice_${scene.sceneId}`);
        if (b64) {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const isMP3 = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;
          const ext   = isMP3 ? 'mp3' : 'wav';
          const mime  = isMP3 ? 'audio/mpeg' : 'audio/wav';
          fd.append('files', new Blob([bytes], { type: mime }), `voice_${scene.sceneId}.${ext}`);
        }
      }
    }

    // ── Background music ───────────────────────────────────────────────────
    const bg = project.globalSettings?.backgroundMusic;

    if (bg?.option === 'upload') {
      // User uploaded their own file — retrieve it from IndexedDB where the
      // create-project page saved it before navigating here
      onStatus('Attaching uploaded background music…');
      const stored = await getUploadedBgMusic();
      if (stored?.base64) {
        const isMP3  = stored.filename.toLowerCase().endsWith('.mp3');
        const mime   = isMP3 ? 'audio/mpeg' : 'audio/wav';
        const bytes  = Uint8Array.from(atob(stored.base64), c => c.charCodeAt(0));
        fd.append('files', new Blob([bytes], { type: mime }), 'background_music.mp3');
        console.log('[bgMusic] Attached uploaded music from IndexedDB:', stored.filename);
      } else {
        console.warn('[bgMusic] option=upload but no file found in IndexedDB — skipping background music');
      }
    } else if (bg?.option === 'library' && bg?.selectedTrack?.preview_url) {
      // User selected a track from the library — download it from the URL
      onStatus('Downloading background music…');
      const blob = await downloadBgMusic(bg.selectedTrack.preview_url);
      if (blob) fd.append('files', blob, 'background_music.mp3');
    }
    // bg?.option === 'none'  →  no music, do nothing

    return fd;
  };

  // ═══════════════════════════════════════════════════════
  // FINAL VIDEO RENDER
  // ═══════════════════════════════════════════════════════
  const generateFinalVideo = async () => {
    if (!project) return;

    setIsRendering(true);
    setRenderError(null);
    setDownloadUrl(null);
    setSceneResults([]);
    setFileSizeMb(null);

    try {
      const fd = await buildFormData(setRenderStatus);

      setRenderStatus('Rendering on server… this may take a minute ☕');
      const res = await fetch(`${API_BASE}/api/render-video`, { method: 'POST', body: fd });

      let data: any;
      try { data = await res.json(); }
      catch { throw new Error(`Server error (HTTP ${res.status})`); }

      if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);

      setDownloadUrl(`${API_BASE}${data.downloadUrl}`);
      setDownloadFilename(data.filename);
      setFileSizeMb(data.fileSizeMb);
      setRenderStatus('Done!');

    } catch (err: any) {
      setRenderError(err?.message ?? 'Unknown error');
      setRenderStatus('');
    } finally {
      setIsRendering(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // SCENE VIDEOS RENDER (one .mp4 per scene)
  // ═══════════════════════════════════════════════════════
  const generateSceneVideos = async () => {
    if (!project) return;

    setIsRendering(true);
    setRenderError(null);
    setDownloadUrl(null);
    setSceneResults([]);
    setScenesRenderInfo('');

    try {
      const fd = await buildFormData(setRenderStatus);

      setRenderStatus('Rendering individual scene videos on server… ☕');
      const res = await fetch(`${API_BASE}/api/render-video-scenes`, { method: 'POST', body: fd });

      let data: any;
      try { data = await res.json(); }
      catch { throw new Error(`Server error (HTTP ${res.status})`); }

      if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);

      setSceneResults(data.scenes || []);
      setScenesRenderInfo(
        `${data.renderedScenes} of ${data.totalScenes} scenes rendered` +
        (data.skipped > 0 ? ` · ${data.skipped} skipped` : '')
      );
      setRenderStatus('Done!');

    } catch (err: any) {
      setRenderError(err?.message ?? 'Unknown error');
      setRenderStatus('');
    } finally {
      setIsRendering(false);
    }
  };

  //clear data
  // Clear current project and prepare for a new one
const clearCurrentProject = async () => {
  if (!confirm("Clear current project and start fresh? All unsaved progress will be lost.")) {
    return;
  }

  try {
    // 1. Clear IndexedDB (images + voices)
    const db = await openDB();
    
    // Clear images
    const imageTx = db.transaction(IMAGE_STORE, 'readwrite');
    await imageTx.objectStore(IMAGE_STORE).clear();
    
    // Clear voices
    const voiceTx = db.transaction(VOICE_STORE, 'readwrite');
    await voiceTx.objectStore(VOICE_STORE).clear();

    // Clear uploaded background music
    try {
      const bgTx = db.transaction(BG_MUSIC_STORE, 'readwrite');
      bgTx.objectStore(BG_MUSIC_STORE).clear();
    } catch { /* store may not exist yet on older sessions */ }

    // 2. Clear localStorage project
    localStorage.removeItem('currentPixnarrProject');

    // 3. Reset all states
    setProject(null);
    setScenesStatus({});
    setModalScene(null);
    setModalData(null);
    clearFullVoice();

    alert("✅ Current project cleared successfully.\n\nSystem is ready for a new project.");
    // Redirect to project create page
    window.location.href = '/create';

  } catch (err) {
    console.error("Error clearing project:", err);
    alert("Failed to clear project. Please refresh the page.");
  }
};






  // ═══════════════════════════════════════════════════════
  // Modal helpers
  // ═══════════════════════════════════════════════════════
  const openModal = async (scene: any) => {
    setModalScene(scene);
    setModalData(JSON.parse(JSON.stringify(scene)));
    setHasChanges(false);
  };

  const regenerateImage = async () => {
    if (!modalData) return;
    setIsRegenerating(true);
    const sid = modalData.sceneId;
    try {
      const res  = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: modalData.visual.prompt, width: imageWidth, height: imageHeight, sceneId: sid }),
      });
      const data = await res.json();
      if (data.success && data.imageBase64) {
        await saveBase64(IMAGE_STORE, `image_${sid}`, data.imageBase64);
        const url = await getBlobUrl(IMAGE_STORE, `image_${sid}`, 'image/png');
        setModalData((p: any) => ({ ...p, visual: { ...p.visual, imageUrl: url } }));
        setScenesStatus((p: any) => ({ ...p, [sid]: { ...p[sid], image: url, completed: true } }));
        setHasChanges(true);
      }
    } catch { alert('Image regeneration failed'); }
    finally { setIsRegenerating(false); }
  };

  const handleVoiceUpload = (sceneId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl  = e.target?.result as string;
      const rawBase64 = dataUrl.split(',')[1];
      await saveBase64(VOICE_STORE, `voice_${sceneId}`, rawBase64);
      const blobUrl = URL.createObjectURL(file);
      if (modalData?.sceneId === sceneId) {
        setModalData((p: any) => ({ ...p, voice: { ...p.voice, audioUrl: blobUrl } }));
        setHasChanges(true);
      }
      setScenesStatus((p: any) => ({ ...p, [sceneId]: { ...p[sceneId], voice: blobUrl } }));
    };
    reader.readAsDataURL(file);
  };

  // Upload a user-provided image directly into IndexedDB for a scene
  const handleImageUpload = (sceneId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl   = e.target?.result as string;
      const rawBase64 = dataUrl.split(',')[1];
      await saveBase64(IMAGE_STORE, `image_${sceneId}`, rawBase64);
      const blobUrl = URL.createObjectURL(file);
      // Update modal preview immediately
      if (modalData?.sceneId === sceneId) {
        setModalData((p: any) => ({ ...p, visual: { ...p.visual, imageUrl: blobUrl } }));
        setHasChanges(true);
      }
      // Update scene grid card
      setScenesStatus((p: any) => ({
        ...p,
        [sceneId]: { ...p[sceneId], image: blobUrl, completed: true },
      }));
    };
    reader.readAsDataURL(file);
  };

  const saveModal = () => {
    if (!modalData || !modalScene) return;
    const clean = { ...modalData, visual: { ...modalData.visual, imageUrl: null } };
    const updated = {
      ...project,
      scenes: project.scenes.map((s: any) => s.sceneId === modalScene.sceneId ? clean : s),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('currentPixnarrProject', JSON.stringify(updated));
    setProject(updated);
    setModalScene(null);
    setModalData(null);
    setHasChanges(false);
  };

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════
  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        Loading project…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-1">{project.projectName}</h1>
        <p className="text-zinc-500 mb-4 text-sm">
          {project.metadata?.sceneCount} scenes · {project.metadata?.totalDuration}s
        </p>

         <button
            onClick={clearCurrentProject}
            className="mb-8 px-6 py-3 border border-red-500 text-red-400 hover:bg-red-950 rounded-2xl text-sm"
          >
          🗑️ Clear Project & Start New
          </button>

        {/* ══════════════════════════════════════════════════════
            FULL VOICEOVER UPLOAD
        ══════════════════════════════════════════════════════ */}
        <div className="mb-8 p-6 bg-zinc-900 border border-zinc-700 rounded-3xl">
          <div className="flex items-center gap-3 mb-1">
            <Mic size={20} className="text-violet-400 shrink-0" />
            <h2 className="text-base font-semibold">Full Voiceover</h2>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-0.5 rounded-full">Optional</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5 ml-8">
            Upload one continuous audio file covering the whole video. When present, per-scene voice uploads are ignored and the backend auto-splits this file by each scene's start time and duration.
          </p>

          {fullVoiceFile ? (
            <div className="flex items-center gap-4 p-4 bg-violet-950/30 border border-violet-500/40 rounded-2xl">
              <Mic size={22} className="text-violet-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{fullVoiceFile.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {(fullVoiceFile.size / 1024 / 1024).toFixed(2)} MB · overrides all per-scene voices
                </p>
                {fullVoiceBlobUrl && (
                  <audio controls src={fullVoiceBlobUrl} className="mt-3 w-full h-8" />
                )}
              </div>
              <button
                onClick={clearFullVoice}
                title="Remove full voiceover"
                className="shrink-0 p-2 hover:bg-red-950 rounded-xl text-zinc-400 hover:text-red-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col sm:flex-row items-center gap-4 p-5 border border-dashed border-zinc-600 hover:border-violet-400 rounded-2xl cursor-pointer transition-colors group">
              <div className="w-12 h-12 bg-zinc-800 group-hover:bg-violet-950/40 rounded-2xl flex items-center justify-center shrink-0 transition-colors">
                <Upload size={22} className="text-zinc-400 group-hover:text-violet-400 transition-colors" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-sm font-medium text-zinc-300">Click to upload full voiceover</p>
                <p className="text-xs text-zinc-500 mt-0.5">.mp3 or .wav · one file for the entire video</p>
              </div>
              <input
                type="file"
                accept=".mp3,.wav"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFullVoiceUpload(f); }}
              />
            </label>
          )}
        </div>

        {/* ── Top bar: image count + split render button ── */}
        <div className="flex justify-between items-center mb-8">
          <p className="text-zinc-400 text-sm">
            {Object.values(scenesStatus).filter((s: any) => s.completed).length} / {project.scenes.length} images ready
            {fullVoiceFile && (
              <span className="ml-3 text-violet-400 text-xs font-medium">🎙 Full voiceover active</span>
            )}
          </p>

          {/* Split button */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex rounded-2xl overflow-hidden border border-cyan-500/40">
              <button
                onClick={generateFinalVideo}
                disabled={isRendering}
                className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-emerald-500 disabled:opacity-40 text-black font-bold text-sm transition-opacity"
              >
                {isRendering
                  ? <><Loader2 className="animate-spin" size={18} /> Rendering…</>
                  : <><Film size={18} /> Create Full Video</>
                }
              </button>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                disabled={isRendering}
                className="flex items-center justify-center px-3 bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-40 text-black border-l border-black/20 hover:brightness-110 transition-all"
                title="More render options"
              >
                <ChevronDown size={18} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl z-30 overflow-hidden">
                <button
                  onClick={() => { setDropdownOpen(false); generateFinalVideo(); }}
                  disabled={isRendering}
                  className="w-full flex items-start gap-3 px-5 py-4 hover:bg-zinc-800 transition-colors text-left disabled:opacity-40"
                >
                  <Film size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Create Full Video</p>
                    <p className="text-xs text-zinc-500 mt-0.5">All scenes merged into one final video</p>
                  </div>
                </button>
                <div className="h-px bg-zinc-700 mx-4" />
                <button
                  onClick={() => { setDropdownOpen(false); generateSceneVideos(); }}
                  disabled={isRendering}
                  className="w-full flex items-start gap-3 px-5 py-4 hover:bg-zinc-800 transition-colors text-left disabled:opacity-40"
                >
                  <Scissors size={18} className="text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Create Video Scenes</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Each scene as its own video — ideal for editors</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Render status ── */}
        {isRendering && renderStatus && (
          <div className="mb-6 flex items-center gap-3 px-5 py-4 bg-zinc-800 border border-zinc-600 rounded-2xl text-cyan-300 text-sm">
            <Loader2 size={18} className="animate-spin shrink-0" />
            {renderStatus}
          </div>
        )}

        {/* ── Error banner ── */}
        {renderError && (
          <div className="mb-6 p-4 bg-red-950/60 border border-red-500 rounded-2xl text-red-300 text-sm font-mono whitespace-pre-wrap">
            <strong>Render Error:</strong> {renderError}
          </div>
        )}

        {/* ── Download card (shown after render) ── */}
        {downloadUrl && (
          <div className="mb-8 p-6 bg-emerald-950/40 border border-emerald-500 rounded-3xl flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <CheckCircle size={40} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-300 font-semibold text-lg">Video ready on server!</p>
                <p className="text-zinc-400 text-sm mt-0.5">{downloadFilename} · {fileSizeMb} MB</p>
              </div>
            </div>
            <a
              href={downloadUrl}
              download={downloadFilename}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-colors shrink-0"
            >
              <Download size={20} />
              Download
            </a>
          </div>
        )}

        {/* ── Scene videos results ── */}
        {sceneResults.length > 0 && (
          <div className="mb-8 p-6 bg-violet-950/30 border border-violet-500/50 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={24} className="text-violet-400 shrink-0" />
              <div>
                <p className="text-violet-300 font-semibold">Scene Videos Ready!</p>
                <p className="text-zinc-400 text-xs mt-0.5">{scenesRenderInfo}</p>
              </div>
            </div>
            <div className="space-y-2">
              {sceneResults.map((sr: any) => (
                <div key={sr.sceneId} className="flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900 rounded-2xl border border-zinc-700">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">
                      Scene {sr.order}
                      <span className="ml-2 text-xs text-zinc-500">{sr.duration}s · {sr.fileSizeMb} MB</span>
                    </p>
                    <p className="text-xs text-zinc-600 truncate mt-0.5">{sr.filename}</p>
                  </div>
                  <a
                    href={`${API_BASE}${sr.downloadUrl}`}
                    download={sr.filename}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    <Download size={15} /> Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scene grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {project.scenes.map((scene: any) => {
            const s = scenesStatus[scene.sceneId] || {};
            return (
              <div
                key={scene.sceneId}
                className={`bg-zinc-900 border-2 rounded-2xl overflow-hidden transition-colors ${
                  s.completed ? 'border-emerald-500/70' : 'border-zinc-700'
                }`}
              >
                <div className="relative aspect-video bg-zinc-800">
                  {s.image
                    ? <img src={s.image} alt="" className="w-full h-full object-cover" />
                    : s.loading
                      ? <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
                        </div>
                      : <div className="flex items-center justify-center h-full text-zinc-600 text-xs">No image</div>
                  }
                  {s.voice && (
                    <div
                      className={`absolute bottom-2 right-2 w-2 h-2 rounded-full transition-colors ${fullVoiceFile ? 'bg-zinc-500' : 'bg-cyan-400'}`}
                      title={fullVoiceFile ? 'Voice overridden by full voiceover' : 'Scene voice uploaded'}
                    />
                  )}
                </div>
                <div className="p-3 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 mb-0.5">Scene {scene.order} · {scene.duration}s</p>
                    <p className="text-sm line-clamp-2 leading-snug">{scene.text}</p>
                  </div>
                  <button onClick={() => openModal(scene)} className="p-1.5 hover:bg-zinc-800 rounded-lg shrink-0">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ Edit Modal ═══════════════ */}
      {modalScene && modalData && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl p-8 max-h-[92vh] overflow-auto">

            <h2 className="text-2xl font-semibold mb-6">Scene {modalData.order}</h2>

            <div className="mb-5">
              <label className="text-xs text-zinc-400">Duration (locked)</label>
              <div className="text-3xl font-mono text-emerald-400 mt-1">{modalData.duration}s</div>
            </div>

            <div className="mb-5">
              <label className="text-xs text-zinc-400 block mb-2">Voiceover Text</label>
              <textarea
                value={modalData.text}
                onChange={e => { setModalData({ ...modalData, text: e.target.value }); setHasChanges(true); }}
                className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 resize-none"
              />
            </div>

            <div className="mb-5">
              <label className="text-xs text-zinc-400 block mb-2">Image Prompt</label>
              <textarea
                value={modalData.visual.prompt}
                onChange={e => { setModalData({ ...modalData, visual: { ...modalData.visual, prompt: e.target.value } }); setHasChanges(true); }}
                className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 resize-none"
              />
            </div>

            <div className="mb-7">
              <label className="text-xs text-zinc-400 block mb-2">Image</label>
              <div className="border border-zinc-700 rounded-2xl p-3 mb-3">
                {(modalData.visual.imageUrl || scenesStatus[modalScene.sceneId]?.image)
                  ? <img src={modalData.visual.imageUrl || scenesStatus[modalScene.sceneId].image} className="w-full rounded-xl" alt="" />
                  : <div className="h-40 flex items-center justify-center text-zinc-600">No image</div>
                }
              </div>
              <div className="flex gap-2">
                {/* Regenerate with AI */}
                <button
                  onClick={regenerateImage}
                  disabled={isRegenerating}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 border border-zinc-600 rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  {isRegenerating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                </button>

                {/* Upload own image */}
                <label className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer text-sm">
                  <ImagePlus size={16} className="text-cyan-400 shrink-0" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(modalScene.sceneId, f);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-400">Voice Audio</label>
                {fullVoiceFile && (
                  <span className="text-xs text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full">
                    ⚠ Overridden by full voiceover
                  </span>
                )}
              </div>
              {scenesStatus[modalScene.sceneId]?.voice && (
                <audio controls className={`w-full mb-3 ${fullVoiceFile ? 'opacity-40' : ''}`} src={scenesStatus[modalScene.sceneId].voice} />
              )}
              <label className={`block border border-dashed rounded-2xl py-10 text-center cursor-pointer transition-colors ${fullVoiceFile ? 'border-zinc-700 opacity-50 pointer-events-none' : 'border-zinc-600 hover:border-zinc-400'}`}>
                <Upload size={32} className="mx-auto mb-2 text-zinc-400" />
                <p className="text-sm text-zinc-400">
                  {fullVoiceFile ? 'Disabled — full voiceover is active' : 'Click to upload .wav or .mp3'}
                </p>
                <input type="file" accept=".wav,.mp3" className="hidden"
                  disabled={!!fullVoiceFile}
                  onChange={e => { const f = e.target.files?.[0]; if (f && !fullVoiceFile) handleVoiceUpload(modalScene.sceneId, f); }}
                />
              </label>
            </div>

            <div className="flex gap-3 pt-5 border-t border-zinc-800">
              <button onClick={() => { setModalScene(null); setModalData(null); }}
                className="flex-1 py-4 border border-zinc-600 rounded-2xl text-sm">
                Cancel
              </button>
              <button onClick={saveModal} disabled={!hasChanges}
                className="flex-1 py-4 bg-cyan-500 disabled:bg-zinc-700 text-black font-semibold rounded-2xl text-sm transition-colors">
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
/* Meditation PWA — audio lives only in this device's IndexedDB. */
(function () {
  'use strict';

  const DB_NAME = 'meditation-db';
  const STORE = 'files';
  const KEY = 'current';
  const POS_KEY = 'meditation-position';

  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const setup = $('setup');
  const player = $('player');
  const fileInput = $('fileInput');
  const playBtn = $('playBtn');
  const seek = $('seek');
  const elapsedEl = $('elapsed');
  const remainingEl = $('remaining');
  const titleEl = $('trackTitle');
  const setupStatus = $('setupStatus');
  const cancelChange = $('cancelChange');

  let objectUrl = null;
  let fileId = null;     // identifies the stored file so positions are per-file
  let seeking = false;
  let lastSaved = 0;

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function dbPut(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  // ---------- Helpers ----------
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = String(s).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }
  function prettyName(name) {
    return (name || 'Meditation').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
  }
  function show(which) {
    setup.classList.toggle('hidden', which !== 'setup');
    player.classList.toggle('hidden', which !== 'player');
  }

  // ---------- Position memory ----------
  function savePosition(force) {
    if (!fileId || !isFinite(audio.currentTime)) return;
    const now = Date.now();
    if (!force && now - lastSaved < 3000) return;
    lastSaved = now;
    try { localStorage.setItem(POS_KEY, JSON.stringify({ id: fileId, t: audio.currentTime })); } catch (e) { /* ignore */ }
  }
  function loadPosition() {
    try {
      const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (v && v.id === fileId && typeof v.t === 'number') return v.t;
    } catch (e) { /* ignore */ }
    return 0;
  }

  // ---------- UI updates ----------
  function updateTime() {
    const d = audio.duration, t = audio.currentTime;
    if (!seeking) seek.value = String(Math.floor(t || 0));
    const max = Number(seek.max) || 1;
    seek.style.setProperty('--p', ((Number(seek.value) / max) * 100).toFixed(2) + '%');
    elapsedEl.textContent = fmt(seeking ? Number(seek.value) : t);
    remainingEl.textContent = '-' + fmt((isFinite(d) ? d : 0) - (seeking ? Number(seek.value) : t));
  }
  function updatePlayState() {
    const playing = !audio.paused && !audio.ended;
    $('iconPlay').classList.toggle('hidden', playing);
    $('iconPause').classList.toggle('hidden', !playing);
    playBtn.classList.toggle('playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
  function updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch (e) { /* ignore */ }
  }

  // ---------- Media Session ----------
  function setupMediaSession(title) {
    if (!('mediaSession' in navigator)) return;
    const base = new URL('./', location.href).href;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: 'Meditation',
        album: 'Meditation',
        artwork: [
          { src: base + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: base + 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (e) { /* ignore */ }
    const handlers = {
      play: () => play(),
      pause: () => audio.pause(),
      stop: () => { audio.pause(); savePosition(true); },
      seekbackward: (d) => skip(-((d && d.seekOffset) || 15)),
      seekforward: (d) => skip((d && d.seekOffset) || 15),
      seekto: (d) => {
        if (d && typeof d.seekTime === 'number') {
          if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime;
          updatePositionState();
        }
      }
    };
    Object.keys(handlers).forEach((k) => {
      try { navigator.mediaSession.setActionHandler(k, handlers[k]); } catch (e) { /* unsupported action */ }
    });
  }

  // ---------- Playback ----------
  function play() {
    const p = audio.play();
    if (p && p.catch) p.catch((err) => console.warn('Playback failed:', err));
  }
  function skip(delta) {
    const d = isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(d, audio.currentTime + delta));
    updateTime(); updatePositionState(); savePosition(true);
  }

  function loadRecord(rec) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(rec.blob);
    fileId = rec.name + '|' + rec.size + '|' + (rec.lastModified || 0);
    const title = prettyName(rec.name);
    titleEl.textContent = title;
    document.title = title + ' · Meditation';
    audio.src = objectUrl;
    audio.load();
    setupMediaSession(title);
    show('player');
  }

  audio.addEventListener('loadedmetadata', () => {
    seek.max = String(Math.floor(audio.duration || 0));
    let pos = loadPosition();
    if (pos > audio.duration - 5) pos = 0; // finished last time -> start over
    if (pos > 0) audio.currentTime = pos;
    updateTime(); updatePositionState();
  });
  audio.addEventListener('timeupdate', () => { updateTime(); savePosition(false); });
  audio.addEventListener('play', () => { updatePlayState(); updatePositionState(); });
  audio.addEventListener('playing', updatePositionState);
  audio.addEventListener('pause', () => { updatePlayState(); savePosition(true); });
  audio.addEventListener('ratechange', updatePositionState);
  audio.addEventListener('seeked', () => { updatePositionState(); savePosition(true); });
  audio.addEventListener('ended', () => {
    updatePlayState();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ id: fileId, t: 0 })); } catch (e) { /* ignore */ }
    audio.currentTime = 0; updateTime();
  });
  audio.addEventListener('error', () => {
    console.warn('Audio error', audio.error);
    setupStatus.textContent = 'That file could not be played. Please choose another audio file.';
    cancelChange.classList.add('hidden');
    show('setup');
  });

  playBtn.addEventListener('click', () => { if (audio.paused) play(); else audio.pause(); });
  $('back15').addEventListener('click', () => skip(-15));
  $('fwd15').addEventListener('click', () => skip(15));

  seek.addEventListener('input', () => { seeking = true; updateTime(); });
  seek.addEventListener('change', () => {
    audio.currentTime = Number(seek.value);
    seeking = false; updateTime(); updatePositionState(); savePosition(true);
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') savePosition(true); });
  window.addEventListener('pagehide', () => savePosition(true));

  // ---------- File selection ----------
  $('chooseBtn').addEventListener('click', () => fileInput.click());
  $('changeBtn').addEventListener('click', () => {
    audio.pause();
    setupStatus.textContent = '';
    cancelChange.classList.remove('hidden');
    show('setup');
  });
  cancelChange.addEventListener('click', () => show('player'));

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    setupStatus.textContent = 'Saving to this device…';
    try {
      // Copy into a plain Blob so it no longer depends on the original file on disk.
      const buf = await file.arrayBuffer();
      const rec = {
        blob: new Blob([buf], { type: file.type || 'audio/mpeg' }),
        name: file.name, size: file.size, lastModified: file.lastModified, savedAt: Date.now()
      };
      await dbPut(KEY, rec);
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (e) { /* ignore */ }
      }
      setupStatus.textContent = '';
      loadRecord(rec);
    } catch (err) {
      console.error(err);
      setupStatus.textContent = 'Could not save the file (' + (err && err.name ? err.name : 'error') + '). Your phone may be low on storage.';
    }
  });

  // ---------- Start ----------
  async function init() {
    try {
      const rec = await dbGet(KEY);
      if (rec && rec.blob) { loadRecord(rec); return; }
    } catch (err) {
      console.warn('IndexedDB unavailable:', err);
    }
    cancelChange.classList.add('hidden');
    show('setup');
  }
  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('SW registration failed', e));
    });
  }
})();

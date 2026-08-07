// Store-Abstraktion: nutzt Firebase (echtes Teilen über alle Handys),
// wenn firebase-config.js ausgefüllt ist — sonst lokalen Fallback (IndexedDB + localStorage),
// damit die App sofort läuft und getestet werden kann.

import { firebaseConfig, isConfigured } from './firebase-config.js';

let mode = 'local';
let fb = null; // { app, db, storage, auth, uid, mods }

// ---------- Init ----------
export async function initStore() {
  if (isConfigured) {
    try {
      const [{ initializeApp }, fs, st, au] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
      ]);
      const app = initializeApp(firebaseConfig);
      const db = fs.getFirestore(app);
      const storage = st.getStorage(app);
      const auth = au.getAuth(app);
      const cred = await au.signInAnonymously(auth);
      fb = { app, db, storage, uid: cred.user.uid, fs, st, au };
      mode = 'cloud';
    } catch (e) {
      console.warn('Firebase-Init fehlgeschlagen, nutze lokalen Modus:', e);
      mode = 'local';
    }
  }
  if (mode === 'local') await openDB();
  return mode;
}

export function storeMode() { return mode; }

// ================================================================
// LOCAL FALLBACK (IndexedDB für Blobs, localStorage für Dokumente)
// ================================================================
let idb;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('usareise', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
    };
    r.onblocked = () => { console.warn('IndexedDB blockiert – andere Tabs schließen'); };
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
function idbTx(mode = 'readonly') { return idb.transaction('photos', mode).objectStore('photos'); }
function idbReq(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

const LKEY = k => 'usareise.' + k;
function lget(k, def) { try { return JSON.parse(localStorage.getItem(LKEY(k)) || 'null') ?? def; } catch { return def; } }
function lset(k, v) { localStorage.setItem(LKEY(k), JSON.stringify(v)); emitLocal(k); }

// Simple realtime für lokalen Modus (mehrere Tabs) via BroadcastChannel.
const bc = ('BroadcastChannel' in self) ? new BroadcastChannel('usareise') : null;
const localSubs = {}; // key -> [cb]
function emitLocal(k) {
  if (bc) bc.postMessage({ k });
  (localSubs[k] || []).forEach(cb => cb(lget(k, [])));
}
if (bc) bc.onmessage = e => { const k = e.data.k; (localSubs[k] || []).forEach(cb => cb(lget(k, []))); };
function subLocal(k, cb) {
  (localSubs[k] = localSubs[k] || []).push(cb);
  cb(lget(k, []));
  return () => { localSubs[k] = (localSubs[k] || []).filter(f => f !== cb); };
}

// ================================================================
// PHOTOS
// ================================================================
// meta: { id, folderId, name, date, gps:{lat,lng}, place, photographer, sharpness, phash, kept, added }
export async function addPhoto(blob, meta) {
  const id = meta.id || crypto.randomUUID();
  const rec = { ...meta, id, added: meta.added || Date.now() };
  if (mode === 'cloud') {
    const path = `photos/${id}.jpg`;
    const ref = fb.st.ref(fb.storage, path);
    await fb.st.uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' });
    const url = await fb.st.getDownloadURL(ref);
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'photos', id), { ...rec, url, path });
    return id;
  }
  await idbReq(idbTx('readwrite').put({ ...rec, blob }));
  const list = lget('photoIndex', []);
  list.push(id); lset('photoIndex', list);
  emitLocal('photos');
  return id;
}

export async function updatePhoto(id, patch) {
  if (mode === 'cloud') {
    await fb.fs.updateDoc(fb.fs.doc(fb.db, 'photos', id), patch);
    return;
  }
  const rec = await idbReq(idbTx().get(id));
  if (rec) { await idbReq(idbTx('readwrite').put({ ...rec, ...patch })); emitLocal('photos'); }
}

export async function deletePhoto(id) {
  if (mode === 'cloud') {
    try { await fb.st.deleteObject(fb.st.ref(fb.storage, `photos/${id}.jpg`)); } catch {}
    await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'photos', id));
    return;
  }
  await idbReq(idbTx('readwrite').delete(id));
  lset('photoIndex', lget('photoIndex', []).filter(x => x !== id));
  emitLocal('photos');
}

// Realtime-Abo aller Foto-Metadaten (ohne Blob). cb(list)
export function onPhotos(cb) {
  if (mode === 'cloud') {
    const q = fb.fs.query(fb.fs.collection(fb.db, 'photos'));
    return fb.fs.onSnapshot(q, snap => cb(snap.docs.map(d => d.data())));
  }
  const load = async () => {
    const all = await idbReq(idbTx().getAll());
    cb(all.map(({ blob, ...m }) => m));
  };
  const wrap = () => load();
  return subLocal('photos', wrap);
}

// URL zum Anzeigen eines Fotos (cloud: gespeicherte URL; local: ObjectURL aus IDB).
const urlCache = new Map();
export async function photoURL(meta) {
  if (mode === 'cloud') return meta.url;
  if (urlCache.has(meta.id)) return urlCache.get(meta.id);
  const rec = await idbReq(idbTx().get(meta.id));
  if (!rec || !rec.blob) return '';
  const u = URL.createObjectURL(rec.blob);
  urlCache.set(meta.id, u);
  return u;
}

// Blob holen (für Download / "rausziehen").
export async function photoBlob(meta) {
  if (mode === 'cloud') { const r = await fetch(meta.url); return await r.blob(); }
  const rec = await idbReq(idbTx().get(meta.id));
  return rec ? rec.blob : null;
}

// ================================================================
// GENERISCHE DOKUMENT-LISTEN (Chat, Agenda, Spots, Routen, Accounts)
// cloud: je eine Collection; local: je ein localStorage-Array.
// ================================================================
export function onCollection(name, cb, orderField = 'ts') {
  if (mode === 'cloud') {
    const q = fb.fs.query(fb.fs.collection(fb.db, name), fb.fs.orderBy(orderField));
    return fb.fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }
  return subLocal(name, list => cb([...list].sort((a, b) => (a[orderField] || 0) - (b[orderField] || 0))));
}

// Einmaliges Lesen einer Collection (z.B. Accounts beim Login).
export async function getCollectionOnce(name) {
  if (mode === 'cloud') {
    const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return lget(name, []);
}

export async function addDoc(name, data) {
  const id = data.id || crypto.randomUUID();
  const rec = { ...data, id };
  if (mode === 'cloud') { await fb.fs.setDoc(fb.fs.doc(fb.db, name, id), rec); return id; }
  const list = lget(name, []); list.push(rec); lset(name, list);
  return id;
}

export async function removeDoc(name, id) {
  if (mode === 'cloud') { await fb.fs.deleteDoc(fb.fs.doc(fb.db, name, id)); return; }
  lset(name, lget(name, []).filter(x => x.id !== id));
}

export async function setDocData(name, id, data) {
  if (mode === 'cloud') { await fb.fs.setDoc(fb.fs.doc(fb.db, name, id), { ...data, id }); return; }
  const list = lget(name, []); const i = list.findIndex(x => x.id === id);
  if (i >= 0) list[i] = { ...list[i], ...data, id }; else list.push({ ...data, id });
  lset(name, list);
}

// ---------- Lokales Profil (welches Familienmitglied bin ich auf DIESEM Gerät) ----------
export function myProfile() { return lget('profile', null); }
export function setMyProfile(p) { localStorage.setItem(LKEY('profile'), JSON.stringify(p)); }
export function clearMyProfile() { localStorage.removeItem(LKEY('profile')); }

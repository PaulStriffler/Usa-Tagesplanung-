// On-Device-Foto-Analyse: EXIF (GPS/Datum/Kamera), Schärfe, Duplikat-Hash.
// Läuft komplett im Browser, offline, ohne API.

import { STOPS, haversine, nearestStop } from './plan.js';

// ---------- EXIF ----------
export async function readExif(file) {
  let gps = null, date = null, camera = null;
  try {
    const meta = await exifr.parse(file, {
      tiff: true, ifd0: true, exif: true, gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef']
    });
    if (meta) {
      if (meta.latitude != null && meta.longitude != null) gps = { lat: meta.latitude, lng: meta.longitude };
      date = meta.DateTimeOriginal || meta.CreateDate || null;
      camera = [meta.Make, meta.Model].filter(Boolean).join(' ').trim() || null;
    }
  } catch (e) { /* kein EXIF */ }
  if (!date && file.lastModified) date = new Date(file.lastModified);
  return { gps, date: date ? new Date(date) : null, camera };
}

// ---------- Ort-Zuordnung ----------
export function assignFolder(gps, date) {
  // 1) GPS: kleinster passender Radius gewinnt (kleine Spots vor großen).
  if (gps) {
    let best = null;
    for (const s of STOPS) {
      const d = haversine(gps.lat, gps.lng, s.lat, s.lng);
      if (d <= s.r && (!best || s.r < best.r || (s.r === best.r && d < best.d)))
        best = { id: s.id, r: s.r, d };
    }
    if (best) return best.id;
    // außerhalb aller Radien → trotzdem nächster Stop als grobe Zuordnung
    const near = nearestStop(gps.lat, gps.lng);
    if (near && near.d < 120) return near.stop.id;
  }
  // 2) Datum → Reisetag
  if (date) {
    const iso = toLocalISO(date);
    for (const s of STOPS) if (s.days && s.days.includes(iso)) return s.id;
  }
  return '_unsorted';
}

function toLocalISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- Bild dekodieren (klein) für Schärfe & Hash ----------
async function toGray(file, size) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { return null; }
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, size, size);
  bmp.close && bmp.close();
  const { data } = ctx.getImageData(0, 0, size, size);
  const g = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++)
    g[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
  return g;
}

// Schärfe = Varianz des Laplace-Filters (höher = schärfer).
export async function sharpness(file) {
  const N = 64;
  const g = await toGray(file, N);
  if (!g) return 0;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    const lap = 4 * g[i] - g[i-1] - g[i+1] - g[i-N] - g[i+N];
    sum += lap; sum2 += lap * lap; n++;
  }
  const mean = sum / n;
  return Math.round(sum2 / n - mean * mean); // Varianz
}

// Perceptual Hash (dHash, 64 bit) als Hex-String für Duplikat-Erkennung.
export async function phash(file) {
  const W = 9, H = 8;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return null; }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close && bmp.close();
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = (x, y) => { const i = (y*W+x)*4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  let bits = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += gray(x, y) < gray(x+1, y) ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i+4), 2).toString(16);
  return hex;
}

export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

// ---------- Duplikat-Gruppierung ----------
// Bilder gelten als Duplikat/Serie, wenn Hash sehr ähnlich (hamming<=THRESH)
// UND zeitlich nah (< GAP). Verschiedene Motive am gleichen Ort bleiben getrennt.
const THRESH = 10;      // max. Hash-Abstand für "dasselbe Bild"
const GAP = 90 * 1000;  // 90 s

// Bewertet eine Liste Fotos EINES Ordners: setzt kept true/false + dupOf.
// Behält je Serie die 2 schärfsten. Gibt {kept:[], hidden:[]} zurück.
export function dedupeFolder(photos) {
  const used = new Array(photos.length).fill(false);
  const groups = [];
  for (let i = 0; i < photos.length; i++) {
    if (used[i]) continue;
    const group = [i]; used[i] = true;
    for (let j = i + 1; j < photos.length; j++) {
      if (used[j]) continue;
      const near = photos[i].phash && photos[j].phash && hamming(photos[i].phash, photos[j].phash) <= THRESH;
      const t1 = new Date(photos[i].date || 0).getTime(), t2 = new Date(photos[j].date || 0).getTime();
      const closeTime = Math.abs(t1 - t2) <= GAP;
      if (near && (closeTime || !photos[i].date || !photos[j].date)) { group.push(j); used[j] = true; }
    }
    groups.push(group);
  }
  const kept = [], hidden = [];
  for (const grp of groups) {
    const sorted = grp.map(idx => photos[idx]).sort((a, b) => (b.sharpness || 0) - (a.sharpness || 0));
    sorted.forEach((p, rank) => {
      if (rank < 2) { p.kept = true; p.dupOf = null; kept.push(p); }
      else { p.kept = false; p.dupOf = sorted[0].id; hidden.push(p); }
    });
  }
  return { kept, hidden };
}

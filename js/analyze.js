// On-Device-Foto-Analyse: EXIF (GPS/Datum/Kamera), Schärfe, Duplikat-Hash.
// Läuft komplett im Browser, offline, ohne API.

import { STOPS, haversine, nearestStop, scheduleStopFor } from './plan.js';

// ---------- EXIF ----------
// Eigener Parser: findet den TIFF/Exif-Block im Datei-Bytestrom (funktioniert für
// JPEG UND HEIC vom iPhone) und liest Aufnahmezeit, Kamera & GPS direkt aus.
// exifr scheitert an vielen iPhone-HEICs — dieser Weg ist zuverlässig.
function tiffExif(buf) {
  const dv = new DataView(buf);
  const N = Math.min(buf.byteLength - 4, 4000000); // bis 4 MB nach dem TIFF-Header scannen
  let t = -1;
  for (let i = 0; i < N; i++) {
    const a = dv.getUint8(i);
    if (a !== 0x49 && a !== 0x4D) continue;
    const b = dv.getUint8(i + 1), c = dv.getUint8(i + 2), d = dv.getUint8(i + 3);
    if ((a === 0x49 && b === 0x49 && c === 0x2A && d === 0x00) || (a === 0x4D && b === 0x4D && c === 0x00 && d === 0x2A)) { t = i; break; }
  }
  if (t < 0) return null;
  const le = dv.getUint8(t) === 0x49;
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  const readIFD = off => {
    const m = {}; if (off < 0 || off + 2 > buf.byteLength) return m;
    const n = u16(off);
    for (let e = 0; e < n; e++) { const eo = off + 2 + e * 12; if (eo + 12 > buf.byteLength) break; m[u16(eo)] = { type: u16(eo + 2), count: u32(eo + 4), vo: eo + 8 }; }
    return m;
  };
  const ascii = en => { if (!en) return null; const len = en.count; let p = len <= 4 ? en.vo : t + u32(en.vo); let s = ''; for (let i = 0; i < len && p + i < buf.byteLength; i++) { const ch = dv.getUint8(p + i); if (ch === 0) break; s += String.fromCharCode(ch); } return s.trim() || null; };
  const rats = en => { if (!en || en.count < 3) return null; const p = t + u32(en.vo); const r = i => { const num = u32(p + i * 8), den = u32(p + i * 8 + 4); return den ? num / den : 0; }; return r(0) + r(1) / 60 + r(2) / 3600; };
  try {
    const ifd0 = readIFD(t + u32(t + 4));
    const exif = ifd0[0x8769] ? readIFD(t + u32(ifd0[0x8769].vo)) : {};
    const dto = ascii(exif[0x9003]) || ascii(exif[0x9004]) || ascii(ifd0[0x0132]);
    let date = null;
    if (dto) { const m = dto.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/); if (m) date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); }
    let gps = null;
    if (ifd0[0x8825]) {
      const g = readIFD(t + u32(ifd0[0x8825].vo));
      let lat = rats(g[2]), lng = rats(g[4]);
      if (lat != null && lng != null) {
        if ((ascii(g[1]) || 'N') === 'S') lat = -lat;
        if ((ascii(g[3]) || 'E') === 'W') lng = -lng;
        if (lat || lng) gps = { lat, lng };
      }
    }
    const camera = [ascii(ifd0[0x010F]), ascii(ifd0[0x0110])].filter(Boolean).join(' ').trim() || null;
    return { date, gps, camera };
  } catch (e) { return null; }
}

export async function readExif(file) {
  let gps = null, date = null, camera = null;
  try {
    const buf = await file.arrayBuffer();
    const t = tiffExif(buf);
    if (t) { date = t.date; gps = t.gps; camera = t.camera; }
  } catch (e) { /* weiter mit Fallback */ }
  if (!date || !gps) {
    try {
      const meta = await exifr.parse(file, { tiff: true, ifd0: true, exif: true, gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude'] });
      if (meta) {
        if (!gps && meta.latitude != null && meta.longitude != null) gps = { lat: meta.latitude, lng: meta.longitude };
        if (!date) date = meta.DateTimeOriginal || meta.CreateDate || null;
        if (!camera) camera = [meta.Make, meta.Model].filter(Boolean).join(' ').trim() || null;
      }
    } catch (e) { /* kein EXIF */ }
  }
  if (!date && file.lastModified) date = new Date(file.lastModified);
  return { gps, date: date ? new Date(date) : null, camera };
}

// ---------- Ort-Zuordnung (mehrstufig, mit Confidence) ----------
// Reihenfolge: 1) GPS exakt im Radius eines Spots  2) GPS in der Nähe eines Spots
// 3) Datum → Zielort des Reisetags  4) nichts sicher → "Zum Einordnen".
// Gibt { folderId, confidence, reason } zurück. confidence: 'gps' | 'gps-near' | 'date' | 'none'.
// Toleranz um den Radius herum (GPS ist selten centimetergenau, aber wir wollen
// NICHT in einen weit entfernten Ordner kippen). 3 km Puffer reicht.
const GPS_SLACK = 3;

export function classify(gps, date) {
  if (gps) {
    // Der Ort, in dessen Gebiet das Foto TATSÄCHLICH liegt: nächstgelegener Stop,
    // dessen (Radius + kleiner Puffer) die Koordinate enthält. Kleinste Distanz gewinnt
    // → enge Spots (Forrest Gump Point, Horseshoe Bend) schlagen automatisch große.
    let best = null;
    for (const s of STOPS) {
      const d = haversine(gps.lat, gps.lng, s.lat, s.lng);
      if (d <= s.r + GPS_SLACK && (!best || d < best.d)) best = { id: s.id, d, name: s.name };
    }
    if (best) return { folderId: best.id, confidence: 'gps', reason: `GPS am Ort (${Math.round(best.d)} km zum Zentrum)` };
    // GPS vorhanden, aber an KEINEM bekannten Reiseziel → bewusst nicht raten.
    const near = nearestStop(gps.lat, gps.lng);
    return { folderId: '_unsorted', confidence: 'none', reason: near ? `GPS ~${Math.round(near.d)} km von ${near.stop.name} – kein Treffer` : 'GPS ohne Treffer' };
  }
  // Kein GPS → Datum + Uhrzeit gegen den Reiseplan (Zeitfenster je Tag).
  // So wird z. B. Antelope (vormittags) von Grand Canyon (nachmittags) getrennt.
  if (date) {
    const iso = toLocalISO(date);
    const minutes = date.getHours() * 60 + date.getMinutes();
    const sid = scheduleStopFor(iso, minutes);
    if (sid) {
      const hh = String(date.getHours()).padStart(2, '0'), mm = String(date.getMinutes()).padStart(2, '0');
      return { folderId: sid, confidence: 'time', reason: `kein GPS – nach Reiseplan (${iso}, ${hh}:${mm} Uhr)` };
    }
  }
  return { folderId: '_unsorted', confidence: 'none', reason: 'kein GPS & kein Reisetag – bitte manuell einordnen' };
}

// Kompatibler Wrapper (nur Ordner-ID) für Umsortier-Logik.
export function assignFolder(gps, date) { return classify(gps, date).folderId; }

function toLocalISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- Echte Ortsbestimmung aus GPS (kostenloser Geo-Dienst, kein Schlüssel) ----------
// Liefert einen lesbaren Ortsnamen wie "Page, Arizona, USA" — "wo auf der Welt".
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=de`);
    if (!r.ok) return null;
    const j = await r.json();
    return [j.city || j.locality, j.principalSubdivision, j.countryName].filter(Boolean).join(', ') || null;
  } catch { return null; }
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

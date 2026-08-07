import { FAMILY, STOPS, ITINERARY, itineraryFor, nearestStop, haversine } from './plan.js';
import * as store from './store.js';
import { readExif, assignFolder, sharpness, phash, dedupeFolder } from './analyze.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const TODAY = '2026-08-07'; // Referenz-"heute" während der Reise (aktueller Reisetag)

let PHOTOS = [];        // live Foto-Metadaten
let CUSTOM = [];        // eigene Spots
let ACCOUNTS = [];      // registrierte Accounts (pro Familienmitglied)
let PROFILE = null;
let composeTag = 'msg';

const authorName = () => PROFILE?.username || PROFILE?.name || '—';

// ============================================================
// PASSWORT-HASH (SHA-256, damit kein Klartext gespeichert wird)
// ============================================================
async function hashPw(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('usa-reise::' + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// INTRO + EMBLEM
// ============================================================
function buildEmblem() {
  const svg = $('#emblem');
  svg.innerHTML = `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b3c63"/><stop offset="1" stop-color="#0e1420"/>
      </linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e7bb63"/><stop offset="1" stop-color="#b0483d"/>
      </linearGradient>
    </defs>
    <circle class="draw" cx="150" cy="150" r="140" fill="url(#sky)" stroke="#c99a44" stroke-width="4"/>
    <circle class="draw" cx="150" cy="150" r="128" fill="none" stroke="#b0483d" stroke-width="2" opacity=".7"/>
    <g class="rays" opacity=".9">
      ${Array.from({length:12},(_,i)=>{const a=(-90+i*15)*Math.PI/180;return `<line x1="150" y1="150" x2="${150+120*Math.cos(a)}" y2="${150+120*Math.sin(a)}" stroke="#c99a44" stroke-width="2" opacity=".18"/>`}).join('')}
    </g>
    <circle cx="150" cy="118" r="52" fill="url(#sun)" opacity=".95"/>
    <path class="draw" d="M40 205 L92 150 L128 188 L172 132 L210 178 L260 205 Z" fill="#1b2740" stroke="#c99a44" stroke-width="3"/>
    <path d="M40 205 L92 150 L128 188 L172 132 L210 178 L260 205 Z" fill="#141d2e"/>
    <rect x="30" y="205" width="240" height="30" fill="#0e1420"/>
    ${Array.from({length:5},(_,i)=>`<path d="M${86+i*32} 96 l3.4 7 7.6 .6-5.8 5 1.9 7.4-6.9-4-6.9 4 1.9-7.4-5.8-5 7.6-.6z" fill="#f4ead6"/>`).join('')}
    <text x="150" y="196" text-anchor="middle" font-family="Anton, sans-serif" font-size="58" fill="#f4ead6" letter-spacing="2">S·S</text>
    <text x="150" y="252" text-anchor="middle" font-family="Anton, sans-serif" font-size="17" fill="#c99a44" letter-spacing="4">EST. 2026</text>
  `;
}

function runIntro() {
  buildEmblem();
  const draws = $$('#emblem .draw');
  draws.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
  const tl = gsap.timeline();
  tl.to('#emblem', { opacity: 1, duration: 0.1 })
    .from('#emblem', { scale: 0.6, rotate: -12, opacity: 0, duration: 0.9, ease: 'back.out(1.5)' }, 0)
    .to(draws, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut', stagger: 0.15 }, 0.2)
    .from('#emblem .rays line', { scaleX: 0, transformOrigin: '150px 150px', opacity: 0, stagger: 0.03, duration: 0.5 }, 0.5)
    .to('.intro-word.top', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.9)
    .from('.intro-word.top', { y: 24 }, 0.9)
    .to('.intro-word.sub', { opacity: 1, duration: 0.5 }, 1.15)
    .from('.intro-word.sub', { letterSpacing: '20px' }, 1.15)
    .to('.intro-year', { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.35)
    .from('.intro-year', { scale: 1.4, y: 10 }, 1.35)
    .to('.intro-route', { opacity: 1, duration: 0.5 }, 1.7)
    .to('#intro', { opacity: 0, duration: 0.7, delay: 1.1, ease: 'power2.in', onComplete: afterIntro }, '+=0');
}
async function afterIntro() {
  $('#intro').classList.add('hidden');
  try { await (window.__storeReady || Promise.resolve()); } catch (e) { console.warn(e); }
  try { ACCOUNTS = await store.getCollectionOnce('accounts'); } catch (e) { ACCOUNTS = []; }
  if (PROFILE) enterApp(); else showAuthGate();
}

// Nach dem Login: einmalig um Standort-Freigabe bitten, dann App starten.
function enterApp() {
  if (localStorage.getItem('usareise.locAsked')) { startApp(); return; }
  showLocationGate();
}
function showLocationGate() {
  const gate = $('#locGate'); gate.classList.remove('hidden');
  const done = () => { localStorage.setItem('usareise.locAsked', '1'); gate.classList.add('hidden'); startApp(); };
  $('#locGrant').onclick = () => {
    if (!navigator.geolocation) { toast('Standort auf diesem Gerät nicht verfügbar'); return done(); }
    $('#locGrant').textContent = 'Warte auf Freigabe…';
    navigator.geolocation.getCurrentPosition(
      () => { toast('Standort aktiviert 🎯'); done(); },
      () => { toast('Standort später über „Orten" aktivierbar'); done(); },
      { enableHighAccuracy: true, timeout: 12000 });
  };
  $('#locLater').onclick = done;
}
$('#skipIntro').onclick = () => { gsap.killTweensOf('*'); $('#intro').style.opacity = 0; afterIntro(); };

// ============================================================
// AUTH-GATE: Mitglied wählen → Registrieren (Username + Passwort) oder Login
// ============================================================
function accountFor(id) { return ACCOUNTS.find(a => a.id === id || a.memberId === id); }

function showAuthGate() {
  const gate = $('#profileGate'); gate.classList.remove('hidden');
  $('#profileList').innerHTML = FAMILY.map(m => {
    const acc = accountFor(m.id);
    return `<button data-id="${m.id}">
      <span class="av" style="background:${m.color}">${m.name[0]}</span>
      <span class="pl-name">${m.name}</span>
      <span class="pl-status ${acc ? 'reg' : ''}">${acc ? '🔒 anmelden' : '＋ registrieren'}</span>
    </button>`;
  }).join('');
  $$('#profileList button').forEach(b => b.onclick = () => {
    const m = FAMILY.find(x => x.id === b.dataset.id);
    const acc = accountFor(m.id);
    if (acc) openLoginSheet(m, acc); else openRegisterSheet(m);
  });
}

function openRegisterSheet(m) {
  openModal(`
    <h3>Registrieren</h3>
    <p class="sheet-lead">Du bist <b style="color:${m.color}">${esc(m.name)}</b>. Leg deinen Benutzernamen und ein Passwort fest — damit im Chat & bei Fotos immer steht, von wem etwas kommt.</p>
    <label>Benutzername</label>
    <input type="text" id="rgUser" maxlength="24" value="${esc(m.name)}" autocomplete="off">
    <label>Passwort</label>
    <input type="password" id="rgPw" autocomplete="new-password" placeholder="mind. 4 Zeichen">
    <label>Passwort wiederholen</label>
    <input type="password" id="rgPw2" autocomplete="new-password" placeholder="nochmal eingeben">
    <div class="btns"><button class="btn-ghost" id="rgCancel">Zurück</button><button class="btn-primary" id="rgSave">Konto anlegen</button></div>`);
  $('#rgCancel').onclick = closeModal;
  $('#rgSave').onclick = async () => {
    const user = $('#rgUser').value.trim(), pw = $('#rgPw').value, pw2 = $('#rgPw2').value;
    if (!user) return toast('Bitte Benutzernamen eingeben');
    if (pw.length < 4) return toast('Passwort mind. 4 Zeichen');
    if (pw !== pw2) return toast('Passwörter stimmen nicht überein');
    const hash = await hashPw(pw);
    const acc = { id: m.id, memberId: m.id, name: m.name, username: user, hash, ts: Date.now() };
    await store.setDocData('accounts', m.id, acc);
    ACCOUNTS = ACCOUNTS.filter(a => a.id !== m.id).concat(acc);
    loginSuccess(m, user);
  };
}

function openLoginSheet(m, acc) {
  openModal(`
    <h3>Anmelden</h3>
    <p class="sheet-lead">Willkommen zurück, <b style="color:${m.color}">${esc(acc.username || m.name)}</b>. Bitte gib dein Passwort ein.</p>
    <label>Passwort</label>
    <input type="password" id="lgPw" autocomplete="current-password" placeholder="Passwort">
    <div class="btns"><button class="btn-ghost" id="lgCancel">Zurück</button><button class="btn-primary" id="lgGo">Anmelden</button></div>
    <button class="link-reset" id="lgReset">Passwort vergessen?</button>`);
  $('#lgCancel').onclick = closeModal;
  const submit = async () => {
    const pw = $('#lgPw').value;
    if (await hashPw(pw) === acc.hash) loginSuccess(m, acc.username);
    else toast('Falsches Passwort');
  };
  $('#lgGo').onclick = submit;
  $('#lgPw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  $('#lgReset').onclick = () => {
    if (confirm(`Passwort für ${acc.username || m.name} zurücksetzen und neu registrieren?`)) openRegisterSheet(m);
  };
}

function loginSuccess(m, username) {
  PROFILE = { ...m, username };
  store.setMyProfile(PROFILE);
  closeModal();
  $('#profileGate').classList.add('hidden');
  enterApp();
}

function logout() {
  if (!confirm('Abmelden? Auf diesem Gerät wird die Anmeldung entfernt.')) return;
  store.clearMyProfile(); location.reload();
}

// ============================================================
// APP START
// ============================================================
async function startApp() {
  $('#app').classList.remove('hidden');
  $('#chatWho').textContent = 'als ' + authorName();
  renderHome();
  renderAccountChip();
  bindNav();
  bindUpload();
  bindChat();
  bindRoute();
  bindLocation();
  $('#addSpotBtn').onclick = openSpotModal;

  // Live-Abos
  store.onPhotos(list => { PHOTOS = list; onPhotosChanged(); });
  store.onCollection('agenda', renderTodos, 'ts');
  store.onCollection('chat', renderChat, 'ts');
  store.onCollection('spots', list => { CUSTOM = list; renderFolders(); });
  store.onCollection('accounts', list => { ACCOUNTS = list; }, 'ts');
  store.onCollection('routes', () => {});

  revealOnScroll();
}

function renderAccountChip() {
  const el = $('#acctChip');
  if (!el || !PROFILE) return;
  el.innerHTML = `<span class="ac-av" style="background:${PROFILE.color}">${(authorName())[0]}</span><span class="ac-name">${esc(authorName())}</span>`;
  el.onclick = logout;
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  const badge = $('#modeBadge');
  if (store.storeMode() === 'cloud') { badge.textContent = 'cloud · live'; badge.classList.add('cloud'); }
  const idx = ITINERARY.findIndex(d => d.date === TODAY);
  $('#tripDay').textContent = idx >= 0 ? `Tag ${idx + 1} von ${ITINERARY.length}` : 'Roadtrip 2026';

  const t = itineraryFor(TODAY) || ITINERARY[0];
  $('#todayCard').innerHTML = `
    <div class="tc-sun"></div>
    <div class="tc-eyebrow">${fmtDate(t.date)} · Heute</div>
    <div class="tc-title">${esc(t.title)}</div>
    <div class="tc-meta">
      ${t.wake ? `<span class="chip">⏰ Aufstehen ${t.wake}</span>` : ''}
      ${t.breakfast ? `<span class="chip">🍳 Frühstück</span>` : ''}
      ${t.km ? `<span class="chip">🚗 ${t.km} km</span>` : ''}
      ${t.hotel ? `<span class="chip">🛏 ${esc(t.hotel)}</span>` : ''}
    </div>
    <div class="tc-acts">${(t.acts || []).slice(0, 4).map(a => `<span>${esc(a)}</span>`).join('')}</div>`;

  renderAgenda();
}

function renderAgenda() {
  const el = $('#agenda');
  el.innerHTML = ITINERARY.map((d, i) => {
    const isNow = d.date === TODAY;
    return `<div class="agenda-card ${isNow ? 'now' : ''}">
      <div class="ac-num">${i + 1}</div>
      <div class="ac-date">${fmtDate(d.date)}${isNow ? ' · Heute' : ''}</div>
      <div class="ac-title">${esc(d.title)}</div>
      <div class="ac-sub">
        ${d.wake ? `<span>⏰ <b>${d.wake}</b> aufstehen</span>` : `<span>—</span>`}
        ${d.hotel ? `<span>🛏 ${esc(d.hotel)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  const now = el.querySelector('.now'); if (now) el.scrollLeft = now.offsetLeft - 12;
}

function renderTodos(list) {
  const el = $('#todos');
  if (!list.length) { el.innerHTML = `<div class="empty-hint">Noch keine To-Dos. Schreib im Chat mit 📌 To-do / 📍 Ziel / ⏰ Aufstehzeit.</div>`; return; }
  const ico = { todo: '📌', ziel: '📍', wake: '⏰' };
  const bg = { todo: '#3a2f14', ziel: '#14304a', wake: '#3a1f1f' };
  el.innerHTML = list.map(x => `
    <div class="todo-row">
      <div class="t-ico" style="background:${bg[x.kind] || '#222'}">${ico[x.kind] || '•'}</div>
      <div class="t-body"><b>${esc(x.text)}</b><small>${esc(x.by || '')}${x.day ? ' · ' + fmtDate(x.day) : ''}</small></div>
      <button class="t-del" data-id="${x.id}">×</button>
    </div>`).join('');
  $$('#todos .t-del').forEach(b => b.onclick = () => store.removeDoc('agenda', b.dataset.id));
}

// ============================================================
// LOCATION
// ============================================================
function bindLocation() {
  $('#locBtn').onclick = () => {
    if (!navigator.geolocation) { toast('Standort nicht verfügbar'); return; }
    $('#locSub').textContent = 'Bestimme Standort…';
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const near = nearestStop(lat, lng);
      $('#locName').textContent = near ? near.stop.name : 'Unbekannt';
      $('#locSub').textContent = near
        ? (near.d < 5 ? 'Ihr seid mittendrin 🎯' : `ca. ${Math.round(near.d)} km entfernt · ${lat.toFixed(3)}, ${lng.toFixed(3)}`)
        : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }, () => { $('#locSub').textContent = 'Standort abgelehnt oder Fehler'; }, { enableHighAccuracy: true, timeout: 10000 });
  };
}

// ============================================================
// UPLOAD + ANALYSE
// ============================================================
function bindUpload() {
  $('#uploadPortal').onclick = e => { if (!e.target.closest('.up-progress')) $('#fileInput').click(); };
  $('#fileInput').onchange = e => { const f = [...e.target.files]; if (f.length) processFiles(f); e.target.value = ''; };
}

async function processFiles(files) {
  const prog = $('#upProgress'), bar = prog.querySelector('.up-bar>div'), txt = $('#upTxt');
  prog.classList.remove('hidden'); bar.style.width = '0'; let done = 0;
  const touchedFolders = new Set();

  for (const f of files) {
    txt.textContent = `Analysiere ${done + 1}/${files.length}…`;
    try {
      const { gps, date, camera } = await readExif(f);
      const folderId = assignFolder(gps, date);
      const [sh, ph] = await Promise.all([sharpness(f), phash(f)]);
      const place = folderId === '_unsorted' ? 'Unsortiert' : (STOPS.find(s => s.id === folderId)?.name || folderId);
      await store.addPhoto(f, {
        folderId, name: f.name, date: date ? date.toISOString() : null,
        gps: gps || null, place, photographer: authorName(),
        photographerColor: PROFILE?.color || '#888', camera: camera || null,
        sharpness: sh, phash: ph, kept: true, dupOf: null,
      });
      touchedFolders.add(folderId);
    } catch (e) { console.error(e); }
    done++; bar.style.width = (done / files.length * 100) + '%';
  }
  txt.textContent = 'Suche Duplikate…';
  setTimeout(async () => {
    for (const fid of touchedFolders) await runDedupe(fid);
    prog.classList.add('hidden');
    toast(`${done} Foto${done === 1 ? '' : 's'} analysiert & einsortiert`);
  }, 500);
}

async function runDedupe(folderId) {
  const inFolder = PHOTOS.filter(p => p.folderId === folderId);
  if (inFolder.length < 2) return;
  const clone = inFolder.map(p => ({ ...p }));
  dedupeFolder(clone);
  for (const p of clone) {
    const orig = inFolder.find(o => o.id === p.id);
    if (orig && (orig.kept !== p.kept || orig.dupOf !== p.dupOf))
      await store.updatePhoto(p.id, { kept: p.kept, dupOf: p.dupOf });
  }
}

function onPhotosChanged() { renderFolders(); if (currentFolder) renderPhotoGrid(); }

// ============================================================
// FOLDERS
// ============================================================
function allFolderDefs() {
  return [
    { id: '_unsorted', name: 'Unsortiert' },
    ...CUSTOM.map(c => ({ ...c, custom: true })),
    ...STOPS,
  ];
}
function renderFolders() {
  const counts = {};
  for (const p of PHOTOS) if (p.kept !== false) counts[p.folderId] = (counts[p.folderId] || 0) + 1;
  const covers = {};
  for (const p of PHOTOS) if (p.kept !== false && !covers[p.folderId]) covers[p.folderId] = p;

  const defs = allFolderDefs().filter(f => f.id !== '_unsorted' || counts['_unsorted']);
  defs.sort((a, b) => {
    if (a.id === '_unsorted') return -1; if (b.id === '_unsorted') return 1;
    return (counts[b.id] || 0) - (counts[a.id] || 0);
  });

  const el = $('#folderList');
  el.innerHTML = defs.map(f => {
    const c = counts[f.id] || 0, cover = covers[f.id];
    const days = f.days ? dateRange(f.days) : '';
    return `<div class="folder-row ${f.custom ? 'custom' : ''} ${f.id === '_unsorted' ? 'unsorted' : ''}" data-id="${f.id}">
      <div class="fr-cover ${cover ? '' : 'empty'}" ${cover ? `data-cover="${f.id}"` : ''}>${cover ? '' : '📷'}</div>
      <div class="fr-body">
        <b>${f.custom ? '<span class="badge-star">★</span>' : ''}${esc(f.name)}</b>
        <div class="fr-meta">${days || (f.id === '_unsorted' ? 'Ohne Ort/Datum' : 'Reiseziel')}</div>
      </div>
      <div class="fr-count"><b>${c}</b><small>FOTOS</small></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.folder-row').forEach(r => r.onclick = () => openFolder(r.dataset.id));
  el.querySelectorAll('[data-cover]').forEach(async d => {
    const p = covers[d.dataset.cover]; if (p) d.style.backgroundImage = `url('${await store.photoURL(p)}')`;
  });
}

// ---- Folder detail ----
let currentFolder = null, showDups = false;
function folderName(id) { return id === '_unsorted' ? 'Unsortiert' : (allFolderDefs().find(f => f.id === id)?.name || id); }

function openFolder(id) {
  currentFolder = id; showDups = false;
  const ov = $('#folderDetail'); ov.classList.remove('hidden');
  ov.innerHTML = `
    <div class="od-head">
      <button class="iconbtn" id="odBack">‹</button>
      <h2>${esc(folderName(id))}</h2>
    </div>
    <div class="od-toolbar">
      <span id="odCount"></span><div class="spacer"></div>
      <button id="odDupToggle"></button>
    </div>
    <div class="photo-grid" id="odGrid"></div>`;
  $('#odBack').onclick = () => { ov.classList.add('hidden'); currentFolder = null; };
  $('#odDupToggle').onclick = () => { showDups = !showDups; renderPhotoGrid(); };
  renderPhotoGrid();
}

async function renderPhotoGrid() {
  if (!currentFolder) return;
  let list = PHOTOS.filter(p => p.folderId === currentFolder);
  const hiddenCount = list.filter(p => p.kept === false).length;
  list.sort((a, b) => tOf(a) - tOf(b));
  const shown = showDups ? list : list.filter(p => p.kept !== false);
  $('#odCount').textContent = `${list.filter(p => p.kept !== false).length} Fotos${hiddenCount ? ` · ${hiddenCount} Duplikat${hiddenCount === 1 ? '' : 'e'} ausgeblendet` : ''}`;
  const tgl = $('#odDupToggle'); tgl.textContent = hiddenCount ? (showDups ? 'Duplikate verbergen' : 'Alle zeigen') : '';
  tgl.style.visibility = hiddenCount ? 'visible' : 'hidden';

  const grid = $('#odGrid');
  if (!shown.length) { grid.innerHTML = `<div class="empty-hint" style="grid-column:1/-1">Noch keine Fotos in diesem Ordner.</div>`; return; }
  grid.innerHTML = shown.map(p => `
    <div class="pcard" data-id="${p.id}">
      <div class="pimg" data-img="${p.id}"></div>
      <div class="pinfo">
        <b>${esc(p.name)}</b>
        <div class="prow">📅 ${p.date ? fmtDateTime(p.date) : 'ohne Datum'}</div>
        <div class="prow">📍 ${esc(p.place || '—')}</div>
        <span class="by"><span class="dot" style="background:${p.photographerColor || '#888'}"></span>${esc(p.photographer || '—')}</span>
        ${p.kept === false ? '<div class="dup-tag">Duplikat</div>' : ''}
      </div>
    </div>`).join('');
  grid.querySelectorAll('.pcard').forEach(c => c.onclick = () => openViewer(c.dataset.id));
  grid.querySelectorAll('[data-img]').forEach(async d => {
    const p = shown.find(x => x.id === d.dataset.img); if (p) d.style.backgroundImage = `url('${await store.photoURL(p)}')`;
  });
}

// ---- Viewer ----
async function openViewer(id) {
  const p = PHOTOS.find(x => x.id === id); if (!p) return;
  const v = $('#viewer'); v.classList.add('on');
  const url = await store.photoURL(p);
  v.innerHTML = `
    <div class="vtop">
      <button class="iconbtn" id="vClose">✕</button>
      <div style="display:flex;gap:8px">
        <button class="iconbtn" id="vMove" title="Verschieben">⇄</button>
        <button class="iconbtn" id="vSave" title="Speichern">⤓</button>
        <button class="iconbtn" id="vDel" title="Löschen">🗑</button>
      </div>
    </div>
    <img src="${url}" alt="${esc(p.name)}">
    <div class="vinfo">
      <b>${esc(p.name)}</b>
      <div class="vrow">
        <span>📅 ${p.date ? fmtDateTime(p.date) : 'ohne Datum'}</span>
        <span>📍 ${esc(p.place || '—')}</span>
        <span>📷 ${esc(p.photographer || '—')}</span>
        ${p.camera ? `<span>${esc(p.camera)}</span>` : ''}
        ${p.gps ? `<span>🌐 ${p.gps.lat.toFixed(4)}, ${p.gps.lng.toFixed(4)}</span>` : ''}
      </div>
    </div>`;
  $('#vClose').onclick = () => v.classList.remove('on');
  $('#vMove').onclick = () => openMoveModal([id]);
  $('#vSave').onclick = async () => {
    const blob = await store.photoBlob(p); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = p.name || 'foto.jpg'; a.click();
    toast('Foto gespeichert');
  };
  $('#vDel').onclick = async () => { if (confirm('Foto löschen?')) { await store.deletePhoto(id); v.classList.remove('on'); } };
}

// ============================================================
// MODALS (Spot / Move)
// ============================================================
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

function openSpotModal() {
  openModal(`
    <h3>Eigener Spot</h3>
    <label>Name (z.B. Forrest Gump Point)</label>
    <input type="text" id="spName" placeholder="Name">
    <div class="row">
      <div><label>Breite (lat)</label><input type="number" id="spLat" step="0.0001" placeholder="37.1042"></div>
      <div><label>Länge (lng)</label><input type="number" id="spLng" step="0.0001" placeholder="-109.9908"></div>
    </div>
    <label>Radius: <span id="spRv">5</span> km</label>
    <input type="range" id="spR" min="1" max="60" value="5" oninput="document.getElementById('spRv').textContent=this.value">
    <div class="btns"><button class="btn-ghost" id="spGps">📍 Standort</button></div>
    <div class="btns"><button class="btn-ghost" id="spCancel">Abbrechen</button><button class="btn-primary" id="spSave">Speichern</button></div>`);
  $('#spCancel').onclick = closeModal;
  $('#spGps').onclick = () => navigator.geolocation?.getCurrentPosition(pos => {
    $('#spLat').value = pos.coords.latitude.toFixed(5); $('#spLng').value = pos.coords.longitude.toFixed(5); toast('Standort übernommen');
  }, () => toast('GPS fehlgeschlagen'));
  $('#spSave').onclick = async () => {
    const name = $('#spName').value.trim(), lat = parseFloat($('#spLat').value), lng = parseFloat($('#spLng').value), r = parseInt($('#spR').value);
    if (!name || isNaN(lat) || isNaN(lng)) { toast('Bitte Name & Koordinaten'); return; }
    await store.addDoc('spots', { name, lat, lng, r, ts: Date.now() });
    closeModal(); toast('Spot gespeichert – ordne Fotos neu…'); await reassignAll();
  };
}

function openMoveModal(ids) {
  const defs = allFolderDefs();
  openModal(`
    <h3>Verschieben nach</h3>
    <div class="move-list">
      ${defs.map(f => `<button data-id="${f.id}">${f.custom ? '★ ' : ''}${esc(f.name)}</button>`).join('')}
    </div>
    <div class="btns"><button class="btn-ghost" id="mvCancel">Abbrechen</button></div>`);
  $('#mvCancel').onclick = closeModal;
  $$('#sheet .move-list button').forEach(b => b.onclick = async () => {
    const target = b.dataset.id;
    for (const id of ids) {
      await store.updatePhoto(id, { folderId: target, place: folderName(target), kept: true, dupOf: null });
    }
    closeModal(); $('#viewer').classList.remove('on'); toast('Verschoben');
  });
}

async function reassignAll() {
  for (const p of PHOTOS) {
    const fid = assignFolder(p.gps, p.date ? new Date(p.date) : null);
    if (fid !== p.folderId) await store.updatePhoto(p.id, { folderId: fid, place: folderName(fid) });
  }
}

// ============================================================
// CHAT
// ============================================================
function bindChat() {
  $$('#chatTags button').forEach(b => b.onclick = () => {
    $$('#chatTags button').forEach(x => x.classList.remove('on')); b.classList.add('on'); composeTag = b.dataset.tag;
    $('#chatInput').placeholder = { msg: 'Nachricht…', todo: 'Neues To-do…', ziel: 'Reiseziel…', wake: 'z.B. „Morgen 6:30 aufstehen"' }[composeTag];
  });
  $('#chatSend').onclick = sendChat;
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
}
async function sendChat() {
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  inp.value = '';
  const ts = Date.now();
  await store.addDoc('chat', { text, tag: composeTag, author: authorName(), authorColor: PROFILE.color, authorId: PROFILE.id, ts });
  if (composeTag !== 'msg') {
    await store.addDoc('agenda', { text, kind: composeTag, by: authorName(), ts });
  }
}
function renderChat(list) {
  const el = $('#chatScroll');
  const tagLabel = { todo: '📌 To-do', ziel: '📍 Ziel', wake: '⏰ Aufstehzeit' };
  const tagColor = { todo: '#c99a44', ziel: '#3f86c0', wake: '#b0483d' };
  el.innerHTML = list.map(m => {
    const mine = m.authorId === PROFILE.id;
    return `<div class="msg ${mine ? 'mine' : ''}">
      ${!mine ? `<div class="m-author" style="color:${m.authorColor || '#c99a44'}">${esc(m.author)}</div>` : ''}
      ${m.tag && m.tag !== 'msg' ? `<div class="m-tag" style="background:${tagColor[m.tag]}22;color:${tagColor[m.tag]}">${tagLabel[m.tag]}</div>` : ''}
      <div class="m-text">${esc(m.text)}</div>
      <div class="m-time">${fmtTime(m.ts)}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ============================================================
// ROUTE
// ============================================================
let routeStops = [];
function bindRoute() {
  const d = $('#routeDate');
  const tmr = new Date(TODAY + 'T12:00:00'); tmr.setDate(tmr.getDate() + 1);
  d.value = tmr.toISOString().slice(0, 10);
  $('#stopSuggest').innerHTML = STOPS.map(s => `<option value="${esc(s.name)}">`).join('');
  d.onchange = prefillRoute; prefillRoute();
  $('#routeAdd').onclick = addRouteStop;
  $('#routeInput').addEventListener('keydown', e => { if (e.key === 'Enter') addRouteStop(); });
  $('#routeOptimize').onclick = optimizeRoute;
}
function prefillRoute() { routeStops = []; renderRouteStops(); }
function addRouteStop() {
  const v = $('#routeInput').value.trim(); if (!v) return;
  const match = STOPS.find(s => s.name.toLowerCase() === v.toLowerCase());
  routeStops.push(match ? { name: match.name, lat: match.lat, lng: match.lng } : { name: v });
  $('#routeInput').value = ''; renderRouteStops();
}
function renderRouteStops() {
  const el = $('#routeStops');
  if (!routeStops.length) { el.innerHTML = `<div class="empty-hint">Füge die Ziele für den Tag hinzu — die App plant die schnellste Reihenfolge.</div>`; return; }
  el.innerHTML = routeStops.map((s, i) => `
    <div class="rstop"><div class="rs-idx">${i + 1}</div><div class="rs-name">${esc(s.name)}${s.lat ? '' : ' <small style="color:#6f7d90">(wird auf Karte gesucht)</small>'}</div><button class="rs-del" data-i="${i}">×</button></div>`).join('');
  el.querySelectorAll('.rs-del').forEach(b => b.onclick = () => { routeStops.splice(+b.dataset.i, 1); renderRouteStops(); });
}
function optimizeRoute() {
  if (!routeStops.length) { toast('Erst Ziele hinzufügen'); return; }
  const build = origin => showRouteResult(orderStops(origin, routeStops));
  if (navigator.geolocation) {
    $('#routeOptimize').textContent = 'Bestimme Standort…';
    navigator.geolocation.getCurrentPosition(
      pos => { $('#routeOptimize').textContent = '🧭 Schnellste Route berechnen'; build({ name: 'Aktueller Standort', lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { $('#routeOptimize').textContent = '🧭 Schnellste Route berechnen'; build(null); },
      { enableHighAccuracy: true, timeout: 8000 });
  } else build(null);
}
// Nearest-Neighbor über die Ziele mit Koordinaten; Unbekannte hinten anhängen.
function orderStops(origin, stops) {
  const withCoord = stops.filter(s => s.lat != null);
  const without = stops.filter(s => s.lat == null);
  const result = [];
  let cur = origin && origin.lat != null ? origin : (withCoord[0] || null);
  const pool = [...withCoord];
  while (pool.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = cur ? haversine(cur.lat, cur.lng, pool[i].lat, pool[i].lng) : 0;
      if (d < bd) { bd = d; bi = i; }
    }
    const next = pool.splice(bi, 1)[0]; result.push(next); cur = next;
  }
  return { origin, ordered: [...result, ...without] };
}
function showRouteResult({ origin, ordered }) {
  let dist = 0; let prev = origin && origin.lat != null ? origin : null;
  for (const s of ordered) { if (prev && s.lat != null) dist += haversine(prev.lat, prev.lng, s.lat, s.lng); if (s.lat != null) prev = s; }
  const mapsUrl = buildMapsUrl(origin, ordered);
  const res = $('#routeResult'); res.classList.remove('hidden');
  res.innerHTML = `
    <h3>Optimierte Route</h3>
    <div class="rr-sum">${ordered.length} Stopps${dist ? ` · ca. ${Math.round(dist)} km Luftlinie` : ''} · schnellste Reihenfolge ab ${origin?.lat ? 'aktuellem Standort' : 'erstem Ziel'}</div>
    <ol>
      ${origin?.lat ? `<li><div class="num">A</div><div class="rl-name">${esc(origin.name)}<small>Start</small></div></li>` : ''}
      ${ordered.map((s, i) => `<li><div class="num">${i + 1}</div><div class="rl-name">${esc(s.name)}${s.lat ? '' : '<small>wird in Maps gesucht</small>'}</div></li>`).join('')}
    </ol>
    <a class="maps-btn" href="${mapsUrl}" target="_blank" rel="noopener">🗺 In Google Maps öffnen</a>`;
  store.setDocData('routes', $('#routeDate').value, { day: $('#routeDate').value, stops: ordered, mapsUrl, by: authorName(), ts: Date.now() });
}
function buildMapsUrl(origin, ordered) {
  const pt = s => s.lat != null ? `${s.lat},${s.lng}` : encodeURIComponent(s.name);
  const pts = [...(origin?.lat ? [origin] : []), ...ordered];
  if (pts.length < 2) return 'https://www.google.com/maps/search/?api=1&query=' + pt(pts[0] || ordered[0]);
  const originStr = pt(pts[0]);
  const dest = pt(pts[pts.length - 1]);
  const way = pts.slice(1, -1).map(pt).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${dest}${way ? '&waypoints=' + way : ''}&travelmode=driving`;
}

// ============================================================
// NAV + REVEAL + UTILS
// ============================================================
function bindNav() {
  $$('.tab').forEach(t => t.onclick = () => goto(t.dataset.goto));
}
function goto(page) {
  $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.goto === page));
  if (page === 'home') revealOnScroll();
}
function revealOnScroll() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$('#page-home .reveal').forEach(el => io.observe(el));
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function tOf(p) { return p.date ? new Date(p.date).getTime() : (p.added || 0); }
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], MO = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function fmtDate(iso) { const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')); return `${WD[d.getDay()]} ${d.getDate()}. ${MO[d.getMonth()]}`; }
function fmtDateTime(iso) { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fmtTime(ts) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function dateRange(days) { if (!days?.length) return ''; const a = days[0], b = days[days.length - 1]; return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`; }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

// ============================================================
// BOOT
// ============================================================
(function boot() {
  PROFILE = store.myProfile();
  window.__storeReady = store.initStore().catch(e => { console.warn('Store-Init:', e); return 'local'; });
  if (window.gsap) runIntro(); else afterIntro();
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

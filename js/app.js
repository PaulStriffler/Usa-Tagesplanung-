import { FAMILY, STOPS, ITINERARY, itineraryFor, nearestStop, haversine, pfpFor } from './plan.js';
import * as store from './store.js';
import { readExif, assignFolder, classify, reverseGeocode, sharpness, phash, hamming } from './analyze.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// „Heute" wird DYNAMISCH aus dem echten Datum bestimmt (kein hartes Datum mehr),
// begrenzt auf den Reisezeitraum. So springt die App automatisch auf den richtigen Tag.
function computeToday() {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const first = ITINERARY[0].date, last = ITINERARY[ITINERARY.length - 1].date;
  if (iso < first) return first;
  if (iso > last) return last;
  return iso;
}
let TODAY = computeToday();

let PHOTOS = [];        // live Foto-Metadaten
let CUSTOM = [];        // eigene Spots
let ACCOUNTS = [];      // registrierte Accounts (pro Familienmitglied)
let TODAY_OVERRIDE = {};// heute geänderte Werte (Aufstehzeit/Abfahrt) aus dem Chat
let LAST_POS = null;    // zuletzt bestimmter Standort {lat,lng,ts}
let FAMILY_CODE_HASH = null; // Familien-Sicherheitscode (gehasht) für Passwort-Reset
let LAST_TODOS = [];    // zuletzt geladene To-Dos (für die Tagesansicht)
let currentDay = null;  // aktuell geöffneter Tag in der Tagesansicht
let PROFILE = null;
let composeTag = 'msg';

const authorName = () => PROFILE?.username || PROFILE?.name || '—';
// Nur Dorothee (m1) & Jens (m2) dürfen Aufstehzeiten/Abfahrten festlegen.
const isPlanner = () => PROFILE && (PROFILE.id === 'm1' || PROFILE.id === 'm2');

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
    <path d="M40 200 Q150 168 260 200" fill="none" stroke="#e7c877" stroke-width="3" stroke-dasharray="4 6" stroke-linecap="round"/>
    <text x="150" y="250" text-anchor="middle" font-family="Anton, sans-serif" font-size="16" fill="#c99a44" letter-spacing="5">EST. 2026</text>
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
  try { const cfg = await store.getCollectionOnce('config'); FAMILY_CODE_HASH = (cfg.find(c => c.id === 'main') || {}).familyCodeHash || null; } catch (e) {}
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
      pos => {
        LAST_POS = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        try { localStorage.setItem('usareise.lastPos', JSON.stringify(LAST_POS)); } catch {}
        toast('Standort aktiviert 🎯'); done();
      },
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
    const av = m.pfp ? `<img src="${m.pfp}" alt="">` : m.name[0];
    return `<button data-id="${m.id}" style="--mc:${m.color}">
      <span class="pl-av">${av}</span>
      <span class="pl-info">
        <span class="pl-name">${m.name}</span>
        <span class="pl-status ${acc ? 'reg' : ''}">${acc ? 'Anmelden' : 'Registrieren'}</span>
      </span>
      <span class="pl-arrow">${acc ? '🔒' : '›'}</span>
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
  $('#lgReset').onclick = () => openResetSheet(m, acc);
}

// Passwort-Reset per Familien-Sicherheitscode (kein SMS nötig, kostenlos & sofort).
function openResetSheet(m, acc) {
  const hasCode = !!FAMILY_CODE_HASH;
  openModal(`
    <h3>Passwort zurücksetzen</h3>
    <p class="sheet-lead">${hasCode
      ? `Gib den <b>Familien-Sicherheitscode</b> ein, um das Passwort für <b style="color:${m.color}">${esc(acc?.username || m.name)}</b> neu zu setzen.`
      : `Es ist noch <b>kein</b> Familien-Sicherheitscode festgelegt. Lege jetzt einen fest — den braucht künftig jeder in der Familie zum Zurücksetzen. Merkt ihn euch gut.`}</p>
    <label>Familien-Sicherheitscode</label>
    <input type="password" id="rsCode" autocomplete="off" placeholder="${hasCode ? 'Code eingeben' : 'neuen Code festlegen'}">
    <label>Neues Passwort</label>
    <input type="password" id="rsPw" autocomplete="new-password" placeholder="mind. 4 Zeichen">
    <label>Neues Passwort wiederholen</label>
    <input type="password" id="rsPw2" autocomplete="new-password">
    <div class="btns"><button class="btn-ghost" id="rsCancel">Zurück</button><button class="btn-primary" id="rsGo">Zurücksetzen</button></div>`);
  $('#rsCancel').onclick = closeModal;
  $('#rsGo').onclick = async () => {
    const code = $('#rsCode').value.trim(), pw = $('#rsPw').value, pw2 = $('#rsPw2').value;
    if (!code) return toast('Bitte Sicherheitscode eingeben');
    if (pw.length < 4) return toast('Passwort mind. 4 Zeichen');
    if (pw !== pw2) return toast('Passwörter stimmen nicht überein');
    const codeHash = await hashPw('code::' + code);
    if (FAMILY_CODE_HASH) { if (codeHash !== FAMILY_CODE_HASH) return toast('Falscher Familien-Sicherheitscode'); }
    else { await store.setDocData('config', 'main', { familyCodeHash: codeHash, ts: Date.now() }); FAMILY_CODE_HASH = codeHash; }
    const hash = await hashPw(pw);
    const username = acc?.username || m.name;
    const account = { id: m.id, memberId: m.id, name: m.name, username, hash, ts: Date.now() };
    await store.setDocData('accounts', m.id, account);
    ACCOUNTS = ACCOUNTS.filter(a => a.id !== m.id).concat(account);
    toast('Passwort neu gesetzt ✓');
    loginSuccess(m, username);
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
  bindNotifications();
  $('#addSpotBtn').onclick = openSpotModal;

  // Live-Abos
  store.onPhotos(list => { const prev = PHOTOS; PHOTOS = list; onPhotosChanged(); notifyNewPhotos(prev, list); });
  store.onCollection('agenda', renderTodos, 'ts');
  store.onCollection('chat', list => { renderChat(list); updateChatBadge(list); notifyNewChat(list); }, 'ts');
  store.onCollection('spots', list => { CUSTOM = list; renderFolders(); });
  store.onCollection('accounts', list => { ACCOUNTS = list; }, 'ts');
  store.onCollection('today', list => { const nov = list.find(d => d.id === TODAY) || {}; notifyWakeChange(TODAY_OVERRIDE, nov); TODAY_OVERRIDE = nov; renderHome(); }, 'ts');
  store.onCollection('routes', () => {});

  revealOnScroll();
}

// ============================================================
// MITTEILUNGEN (Vordergrund/aktive App) + Chat-Zähler
// ============================================================
let CHAT_SEEN_MAX = -1, PHOTO_SEEN = null, notifyReady = false;
function bindNotifications() {
  const banner = $('#notifyBanner');
  const supported = 'Notification' in window;
  if (supported && Notification.permission === 'granted') notifyReady = true;
  if (supported && Notification.permission === 'default' && !localStorage.getItem('usareise.notifyDismissed')) {
    banner.classList.remove('hidden');
  }
  $('#notifyYes').onclick = async () => {
    banner.classList.add('hidden');
    try { const p = await Notification.requestPermission(); notifyReady = (p === 'granted'); if (notifyReady) toast('Mitteilungen aktiviert 🔔'); } catch {}
  };
  $('#notifyNo').onclick = () => { banner.classList.add('hidden'); localStorage.setItem('usareise.notifyDismissed', '1'); };
}
function pushNote(title, body, tag) {
  if (!notifyReady || document.visibilityState === 'visible') return; // sichtbar → kein Popup nötig
  try { new Notification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' }); } catch {}
}
function chatLastRead() { return +(localStorage.getItem('usareise.chatLastRead') || 0); }
function markChatRead() { localStorage.setItem('usareise.chatLastRead', String(Date.now())); updateChatBadge(null); }
function updateChatBadge(list) {
  const el = $('#chatBadge'); if (!el) return;
  const onChat = $('#page-chat')?.classList.contains('active');
  if (onChat) { el.classList.add('hidden'); return; }
  const msgs = list || LAST_CHAT || [];
  const n = msgs.filter(m => (m.ts || 0) > chatLastRead() && m.authorId !== PROFILE?.id).length;
  if (n > 0) { el.textContent = n > 9 ? '9+' : String(n); el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}
let LAST_CHAT = [];
function notifyNewChat(list) {
  LAST_CHAT = list;
  const max = list.reduce((a, m) => Math.max(a, m.ts || 0), 0);
  if (CHAT_SEEN_MAX < 0) { CHAT_SEEN_MAX = max; return; } // Erstladung nicht melden
  const neu = list.filter(m => (m.ts || 0) > CHAT_SEEN_MAX && m.authorId !== PROFILE?.id);
  CHAT_SEEN_MAX = max;
  if (neu.length) { const m = neu[neu.length - 1]; pushNote(`${m.author} im Familien-Chat`, m.text, 'chat'); }
}
function notifyNewPhotos(prev, list) {
  if (PHOTO_SEEN === null) { PHOTO_SEEN = new Set(list.map(p => p.id)); return; }
  const added = list.filter(p => !PHOTO_SEEN.has(p.id) && p.photographer !== authorName());
  list.forEach(p => PHOTO_SEEN.add(p.id));
  if (added.length) pushNote('Neue Fotos 📷', `${added.length} neue${added.length === 1 ? 's Foto' : ' Fotos'} von ${added[0].photographer}`, 'photos');
}
function notifyWakeChange(oldOv, newOv) {
  if (!oldOv || !Object.keys(oldOv).length) return;
  if (newOv.wake && newOv.wake !== oldOv.wake) pushNote('Aufstehzeit geändert ⏰', `Neu: ${newOv.wake} Uhr (${newOv.by || ''})`, 'wake');
  else if (newOv.departure && newOv.departure !== oldOv.departure) pushNote('Abfahrt geändert 🚙', `Neu: ${newOv.departure} Uhr`, 'wake');
}

function renderAccountChip() {
  const el = $('#acctChip');
  if (!el || !PROFILE) return;
  const pfp = pfpFor(PROFILE.id);
  const av = pfp ? `<span class="ac-av"><img src="${pfp}" alt=""></span>`
                 : `<span class="ac-av" style="background:${PROFILE.color}">${(authorName())[0]}</span>`;
  el.innerHTML = `${av}<span class="ac-name">${esc(authorName())}</span>`;
  el.onclick = logout;
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  TODAY = computeToday(); // bei jedem Home-Render das echte Datum neu bestimmen
  const badge = $('#modeBadge');
  if (store.storeMode() === 'cloud') { badge.textContent = 'cloud · live'; badge.classList.add('cloud'); }
  const idx = ITINERARY.findIndex(d => d.date === TODAY);
  $('#tripDay').textContent = idx >= 0 ? `Tag ${idx + 1} von ${ITINERARY.length}` : 'Roadtrip 2026';

  const t = itineraryFor(TODAY) || ITINERARY[0];
  const ov = TODAY_OVERRIDE || {};
  const wake = ov.wake || t.wake;                 // Aufstehzeit (Chat überschreibt Plan)
  const changed = k => ov[k] ? ' changed' : '';   // Hervorhebung bei Chat-Änderung
  $('#todayCard').innerHTML = `
    <div class="tc-sun"></div>
    <div class="tc-eyebrow">${fmtDate(t.date)} · Heute</div>
    <div class="tc-title">${esc(t.title)}</div>
    <div class="tc-meta">
      ${wake ? `<span class="chip${changed('wake')}">⏰ Aufstehen ${esc(wake)}</span>` : ''}
      ${ov.departure ? `<span class="chip changed">🚙 Abfahrt ${esc(ov.departure)}</span>` : ''}
      ${t.breakfast ? `<span class="chip">🍳 Frühstück</span>` : ''}
      ${t.km ? `<span class="chip">🚗 ${t.km} km</span>` : ''}
      ${t.hotel ? `<span class="chip">🛏 ${esc(t.hotel)}</span>` : ''}
    </div>
    <div class="tc-acts">${(t.acts || []).slice(0, 4).map(a => `<span>${esc(a)}</span>`).join('')}</div>
    <div class="tc-more">Ganzen Tag ansehen ›</div>
    ${ov.note ? `<div class="tc-note">✎ ${esc(ov.note)}${ov.by ? ` — ${esc(ov.by)}` : ''}</div>` : ''}`;
  $('#todayCard').onclick = () => openDay(TODAY);

  renderAgenda();
}

function renderAgenda() {
  const el = $('#agenda');
  el.innerHTML = ITINERARY.map((d, i) => {
    const isNow = d.date === TODAY;
    return `<div class="agenda-card ${isNow ? 'now' : ''}" data-date="${d.date}">
      <div class="ac-num">${i + 1}</div>
      <div class="ac-date">${fmtDate(d.date)}${isNow ? ' · Heute' : ''}</div>
      <div class="ac-title">${esc(d.title)}</div>
      <div class="ac-sub">
        ${d.wake ? `<span>⏰ <b>${d.wake}</b> aufstehen</span>` : `<span>—</span>`}
        ${d.hotel ? `<span>🛏 ${esc(d.hotel)}</span>` : ''}
      </div>
      <div class="ac-more">Antippen für Details ›</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.agenda-card').forEach(c => c.onclick = () => openDay(c.dataset.date));
  const now = el.querySelector('.now'); if (now) el.scrollLeft = now.offsetLeft - 12;
}

// Lokales Tagesdatum (YYYY-MM-DD) eines Fotos.
function localDayISO(iso) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Fotos, die AN diesem Tag aufgenommen wurden (entdoppelt, chronologisch).
function dayPhotosFor(dateISO) {
  const list = PHOTOS.filter(p => p.date && localDayISO(p.date) === dateISO);
  return dedupeVisible(list).reps.sort((a, b) => tOf(a) - tOf(b));
}

// ============================================================
// VOLLE TAGESANSICHT (Hero + Fotos + Zeitstrahl + Aufstehzeit + To-Dos)
// ============================================================
function openDay(dateISO) {
  if (!itineraryFor(dateISO)) return;
  currentDay = dateISO;
  $('#dayView').classList.remove('hidden');
  renderDayView(dateISO);
}
async function renderDayView(dateISO) {
  const d = itineraryFor(dateISO); if (!d) return;
  const i = ITINERARY.findIndex(x => x.date === dateISO);
  const isNow = dateISO === TODAY;
  const ov = isNow ? (TODAY_OVERRIDE || {}) : {};
  const wake = ov.wake || d.wake;
  const photos = dayPhotosFor(dateISO);
  const prevDate = i > 0 ? ITINERARY[i - 1].date : null;
  const nextDate = i < ITINERARY.length - 1 ? ITINERARY[i + 1].date : null;
  const todos = LAST_TODOS || [];
  const timeRe = /(\d{1,2})[:.](\d{2})/;
  const acts = (d.acts || []).map(a => { const m = a.match(timeRe); return { time: m ? `${m[1].padStart(2, '0')}:${m[2]}` : '', text: a }; });

  const ov2 = $('#dayView');
  ov2.innerHTML = `
    <div class="dv-top">
      <button class="iconbtn" id="dvBack">‹</button>
      <div class="dv-nav">
        <button class="iconbtn ${prevDate ? '' : 'off'}" id="dvPrev">‹</button>
        <button class="iconbtn ${nextDate ? '' : 'off'}" id="dvNext">›</button>
      </div>
    </div>
    <div class="dv-hero" id="dvHero">
      <div class="dv-hero-grad"></div>
      <div class="dv-hero-txt">
        <div class="dv-eyebrow">Tag ${i + 1} / ${ITINERARY.length} · ${fmtDate(dateISO)}${isNow ? ' · Heute' : ''}</div>
        <h1>${esc(d.title)}</h1>
        <div class="dv-chips">
          ${wake ? `<span class="chip${ov.wake ? ' changed' : ''}">⏰ Aufstehen ${esc(wake)}</span>` : ''}
          ${ov.departure ? `<span class="chip changed">🚙 Abfahrt ${esc(ov.departure)}</span>` : ''}
          ${d.breakfast ? `<span class="chip">🍳 Frühstück</span>` : ''}
          ${d.km ? `<span class="chip">🚗 ${d.km} km</span>` : ''}
          ${d.hotel ? `<span class="chip">🛏 ${esc(d.hotel)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="dv-body">
      ${photos.length ? `
        <div class="dv-section">
          <div class="dv-sec-head"><b>Fotos dieses Tages</b><span>${photos.length}</span></div>
          <div class="dv-photos" id="dvPhotos">${photos.slice(0, 40).map(p => `<div class="dv-ph" data-img="${p.id}" data-id="${p.id}"></div>`).join('')}</div>
        </div>` : `<div class="dv-section"><div class="empty-hint">Noch keine Fotos für diesen Tag — beim Hochladen landen sie automatisch hier.</div></div>`}

      <div class="dv-section">
        <div class="dv-sec-head"><b>Tagesablauf</b></div>
        <div class="dv-timeline">
          ${acts.length ? acts.map(a => `<div class="dv-tl"><div class="dv-tl-time">${a.time || '•'}</div><div class="dv-tl-text">${esc(a.text)}</div></div>`).join('') : '<div class="empty-hint">Für diesen Tag ist nichts eingetragen.</div>'}
        </div>
      </div>

      ${ov.note ? `<div class="dv-section"><div class="day-note">✎ ${esc(ov.note)}${ov.by ? ` — ${esc(ov.by)}` : ''}</div></div>` : ''}

      ${todos.length ? `
        <div class="dv-section">
          <div class="dv-sec-head"><b>To-Dos & Ziele</b><span>${todos.length}</span></div>
          <div class="todos">${todos.map(x => `<div class="todo-row"><div class="t-ico" style="background:${({ todo: '#3a2f14', ziel: '#14304a', wake: '#3a1f1f' })[x.kind] || '#222'}">${({ todo: '📌', ziel: '📍', wake: '⏰' })[x.kind] || '•'}</div><div class="t-body"><b>${esc(x.text)}</b><small>${esc(x.by || '')}</small></div></div>`).join('')}</div>
        </div>` : ''}
      <div style="height:24px"></div>
    </div>`;
  $('#dvBack').onclick = () => ov2.classList.add('hidden');
  if (prevDate) $('#dvPrev').onclick = () => renderDayView(currentDay = prevDate);
  if (nextDate) $('#dvNext').onclick = () => renderDayView(currentDay = nextDate);
  // Hero-Bild (bestes Foto des Tages) laden
  if (photos.length) { const url = await store.photoURL(photos[0]); if (url) $('#dvHero').style.backgroundImage = `url('${url}')`; }
  // Foto-Strip lazy laden + Klick öffnet die Galerie mit den Tagesfotos
  const strip = $('#dvPhotos');
  if (strip) {
    lazyLoadImages(strip.querySelectorAll('[data-img]'), photos);
    strip.querySelectorAll('.dv-ph').forEach(el => el.onclick = () => openViewer(el.dataset.id, photos));
  }
}

function renderTodos(list) {
  LAST_TODOS = list; // für die Tagesansicht merken
  if (currentDay && !$('#dayView').classList.contains('hidden')) renderDayView(currentDay);
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
  $('#locBtn').onclick = () => locate(true);
  // gemerkten Standort laden (für Routenplanung ohne erneutes Fragen)
  try { LAST_POS = JSON.parse(localStorage.getItem('usareise.lastPos') || 'null') || LAST_POS; } catch {}
  // Automatisch orten, wenn die Freigabe schon erteilt wurde.
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' })
      .then(p => { if (p.state === 'granted') locate(false); }).catch(() => {});
  }
}
function locate(interactive) {
  if (!navigator.geolocation) { if (interactive) toast('Standort nicht verfügbar'); return; }
  if (interactive) $('#locSub').textContent = 'Bestimme Standort…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    LAST_POS = { lat, lng, ts: Date.now() };
    try { localStorage.setItem('usareise.lastPos', JSON.stringify(LAST_POS)); } catch {}
    const near = nearestStop(lat, lng);
    $('#locName').textContent = near ? near.stop.name : 'Aktueller Standort';
    const dist = near ? (near.d < 5 ? 'Ihr seid mittendrin 🎯' : `ca. ${Math.round(near.d)} km entfernt`) : '';
    $('#locSub').textContent = `${dist}${dist ? ' · ' : ''}${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    const geo = await reverseGeocode(lat, lng);
    if (geo) $('#locSub').textContent = `${dist}${dist ? ' · ' : ''}${geo}`;
  }, () => { if (interactive) $('#locSub').textContent = 'Standort abgelehnt oder Fehler'; },
    { enableHighAccuracy: true, timeout: 10000 });
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

  for (const f of files) {
    txt.textContent = `Schaue Foto ${done + 1}/${files.length} an…`;
    try {
      // 1) Foto ansehen: EXIF (GPS, Aufnahmezeit, Kamera) auslesen.
      const { gps, date, camera } = await readExif(f);
      // 2) Überlegen wo es hingehört: GPS-Ort → sonst Datum → sonst „Zum Einordnen".
      const { folderId, confidence, reason } = classify(gps, date);
      // 3) Schärfe & Bild-Fingerabdruck für Duplikat-Erkennung.
      const [sh, ph] = await Promise.all([sharpness(f), phash(f)]);
      // 4) Echte Ortsbestimmung „wo auf der Welt" per Geo-Dienst (nur wenn GPS da ist).
      let geoLabel = null;
      if (gps) { txt.textContent = `Bestimme Ort von Foto ${done + 1}/${files.length}…`; geoLabel = await reverseGeocode(gps.lat, gps.lng); }
      const place = folderId === '_unsorted' ? 'Zum Einordnen' : (STOPS.find(s => s.id === folderId)?.name || folderId);
      await store.addPhoto(f, {
        folderId, name: f.name, date: date ? date.toISOString() : null,
        gps: gps || null, place, geoLabel, confidence, reason,
        photographer: authorName(), photographerColor: PROFILE?.color || '#888',
        camera: camera || null, sharpness: sh, phash: ph,
      });
    } catch (e) { console.error(e); }
    done++; bar.style.width = (done / files.length * 100) + '%';
  }
  prog.classList.add('hidden');
  const n = files.length;
  toast(`${n} Foto${n === 1 ? '' : 's'} analysiert & einsortiert`);
}

// Duplikate zur ANZEIGE zusammenfassen (kein Schreiben → für alle konsistent,
// keine Doppelten mehr). Serien am selben Ort/Zeit werden gruppiert, je Gruppe
// bleiben die 2 schärfsten sichtbar. Gibt { reps, hiddenCount } zurück.
function dedupeVisible(list) {
  const sorted = [...list].sort((a, b) => tOf(a) - tOf(b));
  const used = new Array(sorted.length).fill(false);
  const reps = []; let hiddenCount = 0;
  const GAP = 120 * 1000, THRESH = 8;
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    const group = [sorted[i]]; used[i] = true;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      const near = sorted[i].phash && sorted[j].phash && hamming(sorted[i].phash, sorted[j].phash) <= THRESH;
      const t1 = tOf(sorted[i]), t2 = tOf(sorted[j]);
      const closeTime = Math.abs(t1 - t2) <= GAP || !sorted[i].date || !sorted[j].date;
      if (near && closeTime) { group.push(sorted[j]); used[j] = true; }
    }
    group.sort((a, b) => (b.sharpness || 0) - (a.sharpness || 0));
    group.forEach((p, rank) => { if (rank < 2) reps.push(p); else hiddenCount++; });
  }
  reps.sort((a, b) => tOf(a) - tOf(b));
  return { reps, hiddenCount };
}

function onPhotosChanged() { renderFolders(); if (currentFolder) renderPhotoGrid(); }

// ============================================================
// FOLDERS
// ============================================================
function allFolderDefs() {
  return [
    { id: '_group', name: 'Gruppenfotos', group: true },
    { id: '_unsorted', name: 'Zum Einordnen' },
    ...CUSTOM.map(c => ({ ...c, custom: true })),
    ...STOPS,
  ];
}
function renderFolders() {
  // Pro Ordner die Fotos entdoppeln → echte Anzahl + Cover.
  const byFolder = {};
  for (const p of PHOTOS) (byFolder[p.folderId] = byFolder[p.folderId] || []).push(p);
  const counts = {}, covers = {};
  for (const fid in byFolder) {
    const { reps } = dedupeVisible(byFolder[fid]);
    counts[fid] = reps.length;
    if (reps.length) covers[fid] = reps[0];
  }

  const defs = allFolderDefs().filter(f => f.id !== '_unsorted' || counts['_unsorted']);
  const rank = id => id === '_group' ? -2 : id === '_unsorted' ? -1 : 0;
  defs.sort((a, b) => (rank(a.id) - rank(b.id)) || ((counts[b.id] || 0) - (counts[a.id] || 0)));

  const el = $('#folderList');
  el.innerHTML = defs.map(f => {
    const c = counts[f.id] || 0, cover = covers[f.id];
    const days = f.days ? dateRange(f.days) : '';
    const meta = f.group ? 'Gemeinsame Gruppenbilder' : (days || (f.id === '_unsorted' ? 'Ohne Ort/Datum' : 'Reiseziel'));
    return `<div class="folder-row ${f.custom ? 'custom' : ''} ${f.id === '_unsorted' ? 'unsorted' : ''} ${f.group ? 'groupf' : ''}" data-id="${f.id}">
      <div class="fr-cover ${cover ? '' : 'empty'}" ${cover ? `data-cover="${f.id}"` : ''}>${cover ? '' : (f.group ? '👥' : '📷')}</div>
      <div class="fr-body">
        <b>${f.custom ? '<span class="badge-star">★</span>' : ''}${f.group ? '<span class="badge-star">👥</span>' : ''}${esc(f.name)}</b>
        <div class="fr-meta">${meta}</div>
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
function folderName(id) { return id === '_unsorted' ? 'Zum Einordnen' : id === '_group' ? 'Gruppenfotos' : (allFolderDefs().find(f => f.id === id)?.name || id); }

function openFolder(id) {
  currentFolder = id; showDups = false;
  const isCustom = CUSTOM.some(c => c.id === id); // eigene Spots nicht herunterladbar
  const ov = $('#folderDetail'); ov.classList.remove('hidden');
  ov.innerHTML = `
    <div class="od-head">
      <button class="iconbtn" id="odBack">‹</button>
      <h2>${esc(folderName(id))}</h2>
      ${isCustom ? '' : '<button class="iconbtn" id="odDownload" title="Ordner herunterladen">⤓</button>'}
    </div>
    <div class="od-toolbar">
      <span id="odCount"></span><div class="spacer"></div>
      <button id="odDupToggle"></button>
    </div>
    <div class="photo-grid" id="odGrid"></div>`;
  $('#odBack').onclick = () => { ov.classList.add('hidden'); currentFolder = null; };
  $('#odDupToggle').onclick = () => { showDups = !showDups; renderPhotoGrid(); };
  const dl = $('#odDownload'); if (dl) dl.onclick = () => downloadFolder(id);
  renderPhotoGrid();
}

// ---- Ordner als ZIP herunterladen (eigener, schlanker ZIP-Writer, keine Bibliothek) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) { // files: [{name, data:Uint8Array}] — Speichern ohne Kompression
  const chunks = [], central = []; let offset = 0;
  const enc = new TextEncoder();
  const u16 = n => [n & 0xFF, (n >> 8) & 0xFF], u32 = n => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const local = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0)];
    chunks.push(new Uint8Array(local), name, f.data);
    central.push([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)], name);
    offset += local.length + name.length + sz;
  }
  const cdStart = offset; let cdLen = 0; const cdChunks = [];
  for (const [hdr, name] of central) { const h = new Uint8Array(hdr); cdChunks.push(h, name); cdLen += h.length + name.length; }
  const end = [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(cdStart), ...u16(0)];
  return new Blob([...chunks, ...cdChunks, new Uint8Array(end)], { type: 'application/zip' });
}
async function downloadFolder(id) {
  const list = PHOTOS.filter(p => p.folderId === id);
  const { reps } = dedupeVisible(list);
  if (!reps.length) { toast('Keine Fotos zum Herunterladen'); return; }
  toast(`Bereite ${reps.length} Fotos vor…`);
  const files = []; let i = 0;
  for (const p of reps) {
    try { const blob = await store.photoBlob(p); if (!blob) continue; const buf = new Uint8Array(await blob.arrayBuffer()); const nm = (String(i + 1).padStart(3, '0')) + '_' + (p.name || 'foto').replace(/[^\w.\-]/g, '_'); files.push({ name: nm.endsWith('.jpg') || nm.endsWith('.jpeg') ? nm : nm + '.jpg', data: buf }); i++; } catch {}
  }
  if (!files.length) { toast('Download fehlgeschlagen'); return; }
  const zip = makeZip(files);
  const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = folderName(id).replace(/[^\w]/g, '_') + '.zip'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`${files.length} Fotos heruntergeladen`);
}

async function renderPhotoGrid() {
  if (!currentFolder) return;
  const list = PHOTOS.filter(p => p.folderId === currentFolder).sort((a, b) => tOf(a) - tOf(b));
  const { reps, hiddenCount } = dedupeVisible(list);
  const shown = showDups ? list : reps;
  $('#odCount').textContent = `${reps.length} Fotos${hiddenCount ? ` · ${hiddenCount} Duplikat${hiddenCount === 1 ? '' : 'e'} ausgeblendet` : ''}`;
  const tgl = $('#odDupToggle'); tgl.textContent = hiddenCount ? (showDups ? 'Duplikate verbergen' : 'Alle zeigen') : '';
  tgl.style.visibility = hiddenCount ? 'visible' : 'hidden';

  const repIds = new Set(reps.map(r => r.id));
  const grid = $('#odGrid');
  if (!shown.length) { grid.innerHTML = `<div class="empty-hint" style="grid-column:1/-1">Noch keine Fotos in diesem Ordner.</div>`; return; }
  grid.innerHTML = shown.map(p => `
    <div class="pcard" data-id="${p.id}">
      <div class="pimg" data-img="${p.id}"></div>
      <div class="pinfo">
        <b>${esc(p.name)}</b>
        <div class="prow">📅 ${p.date ? fmtDateTime(p.date) : 'ohne Datum'}</div>
        <div class="prow">📍 ${esc(p.geoLabel || p.place || '—')}</div>
        ${confBadge(p)}
        <span class="by"><span class="dot" style="background:${p.photographerColor || '#888'}"></span>${esc(p.photographer || '—')}</span>
        ${!repIds.has(p.id) ? '<div class="dup-tag">Duplikat</div>' : ''}
      </div>
    </div>`).join('');
  grid.querySelectorAll('.pcard').forEach(c => c.onclick = () => openViewer(c.dataset.id));
  // LAZY LOADING: Bilder erst laden, wenn die Kachel in den sichtbaren Bereich scrollt
  // (verhindert, dass bei 168 Fotos alle gleichzeitig geladen werden → kein Hängen).
  lazyLoadImages(grid.querySelectorAll('[data-img]'), shown);
}

// Lazy-Loader: lädt Foto-Thumbnails nur, wenn sie in Sichtweite scrollen. Begrenzte
// Parallelität, damit auch große Ordner (100+ Fotos) sofort flüssig aufgehen.
let lazyIO = null; const lazyQueue = []; let lazyActive = 0;
function lazyPump() {
  while (lazyActive < 4 && lazyQueue.length) {
    const { el, p } = lazyQueue.shift(); lazyActive++;
    store.photoURL(p).then(url => {
      if (url) { el.style.backgroundImage = `url('${url}')`; el.classList.add('loaded'); }
      else el.classList.add('failed');
    }).catch(() => el.classList.add('failed')).finally(() => { lazyActive--; lazyPump(); });
  }
}
function lazyLoadImages(nodes, shown) {
  if (lazyIO) lazyIO.disconnect();
  const byId = {}; shown.forEach(p => byId[p.id] = p);
  lazyIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target, p = byId[el.dataset.img];
      lazyIO.unobserve(el);
      if (p) { lazyQueue.push({ el, p }); }
    }
    lazyPump();
  }, { rootMargin: '400px 0px' }); // etwas vorausladen
  nodes.forEach(n => lazyIO.observe(n));
}

// ---- Viewer mit Wisch-/Scroll-Navigation durch die Galerie ----
let VIEWER_LIST = [], VIEWER_IDX = 0;
function openViewer(id, listOverride) {
  // durchblätterbare Galerie: entweder übergebene Liste oder der aktuelle Ordner
  let list;
  if (listOverride) list = listOverride;
  else { const inF = PHOTOS.filter(p => p.folderId === currentFolder).sort((a, b) => tOf(a) - tOf(b)); list = showDups ? inF : dedupeVisible(inF).reps; }
  VIEWER_LIST = list;
  VIEWER_IDX = Math.max(0, VIEWER_LIST.findIndex(p => p.id === id));
  const v = $('#viewer'); v.classList.add('on');
  showViewerAt(VIEWER_IDX);
  bindViewerSwipe(v);
}
async function showViewerAt(idx) {
  if (idx < 0 || idx >= VIEWER_LIST.length) return;
  VIEWER_IDX = idx;
  const p = VIEWER_LIST[idx];
  const v = $('#viewer');
  const url = await store.photoURL(p);
  const hasPrev = idx > 0, hasNext = idx < VIEWER_LIST.length - 1;
  v.innerHTML = `
    <div class="vtop">
      <button class="iconbtn" id="vClose">✕</button>
      <span class="vcount">${idx + 1} / ${VIEWER_LIST.length}</span>
      <div style="display:flex;gap:8px">
        <button class="iconbtn" id="vMove" title="Verschieben">⇄</button>
        <button class="iconbtn" id="vSave" title="Speichern">⤓</button>
        <button class="iconbtn" id="vDel" title="Löschen">🗑</button>
      </div>
    </div>
    ${hasPrev ? '<button class="vnav prev" id="vPrev">‹</button>' : ''}
    ${hasNext ? '<button class="vnav next" id="vNext">›</button>' : ''}
    <img id="vImg" src="${url}" alt="${esc(p.name)}">
    <div class="vinfo">
      <b>${esc(p.name)}</b>
      <div class="vrow">
        <span>📅 ${p.date ? fmtDateTime(p.date) : 'ohne Datum'}</span>
        <span>📍 ${esc(p.geoLabel || p.place || '—')}</span>
        <span>📷 ${esc(p.photographer || '—')}</span>
        ${p.camera ? `<span>${esc(p.camera)}</span>` : ''}
        ${p.gps ? `<span>🌐 ${p.gps.lat.toFixed(4)}, ${p.gps.lng.toFixed(4)}</span>` : ''}
      </div>
    </div>`;
  const img = $('#vImg'); if (img) { img.style.animation = 'vfade .22s ease'; }
  $('#vClose').onclick = () => v.classList.remove('on');
  $('#vPrev') && ($('#vPrev').onclick = () => showViewerAt(idx - 1));
  $('#vNext') && ($('#vNext').onclick = () => showViewerAt(idx + 1));
  $('#vMove').onclick = () => openMoveModal([p.id]);
  $('#vSave').onclick = async () => {
    const blob = await store.photoBlob(p); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = p.name || 'foto.jpg'; a.click();
    toast('Foto gespeichert');
  };
  $('#vDel').onclick = async () => { if (confirm('Foto löschen?')) { await store.deletePhoto(p.id); VIEWER_LIST.splice(idx, 1); if (!VIEWER_LIST.length) v.classList.remove('on'); else showViewerAt(Math.min(idx, VIEWER_LIST.length - 1)); } };
}
let viewerSwipeBound = false;
function bindViewerSwipe(v) {
  if (viewerSwipeBound) return; viewerSwipeBound = true;
  let x0 = null;
  v.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  v.addEventListener('touchend', e => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 45) return;
    if (dx < 0) showViewerAt(VIEWER_IDX + 1); else showViewerAt(VIEWER_IDX - 1);
  }, { passive: true });
  document.addEventListener('keydown', e => {
    if (!v.classList.contains('on')) return;
    if (e.key === 'ArrowRight') showViewerAt(VIEWER_IDX + 1);
    else if (e.key === 'ArrowLeft') showViewerAt(VIEWER_IDX - 1);
    else if (e.key === 'Escape') v.classList.remove('on');
  });
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
  // Aufstehzeit-Tag nur für Planer (Dorothee & Jens) sichtbar.
  const wakeBtn = $('#chatTags button[data-tag="wake"]');
  if (wakeBtn && !isPlanner()) wakeBtn.remove();
  $$('#chatTags button').forEach(b => b.onclick = () => {
    $$('#chatTags button').forEach(x => x.classList.remove('on')); b.classList.add('on'); composeTag = b.dataset.tag;
    $('#chatInput').placeholder = { msg: 'Nachricht…', todo: 'Neues To-do…', ziel: 'Reiseziel…', wake: 'z.B. „Aufstehen 6:30" oder „Abfahrt 9:00"' }[composeTag];
  });
  $('#chatSend').onclick = sendChat;
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
}
// Uhrzeit aus Text ziehen: „6:30", „0630", „6 Uhr 30", „6 Uhr".
function parseTime(text) {
  let m = text.match(/(\d{1,2})[:.\s]?(\d{2})(?:\s*uhr)?/i);
  if (!m) { m = text.match(/(\d{1,2})\s*uhr/i); if (m) m = [m[0], m[1], '0']; }
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  if (hh > 23 || mm > 59) return null;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
async function sendChat() {
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  if (composeTag === 'wake' && !isPlanner()) { toast('Nur Dorothee & Jens dürfen Aufstehzeiten festlegen'); return; }
  inp.value = '';
  const ts = Date.now();
  await store.addDoc('chat', { text, tag: composeTag, author: authorName(), authorColor: PROFILE.color, authorId: PROFILE.id, ts });
  if (composeTag === 'wake') {
    // Wirkt sofort auf die Heute-Karte oben. Abfahrt vs. Aufstehen anhand Stichwort.
    const time = parseTime(text);
    const patch = { by: authorName(), ts };
    if (/abfahr|losfahr|losgeh|abreise|weiterfahr/i.test(text)) { if (time) patch.departure = time; else patch.note = text; }
    else if (time) patch.wake = time;
    else patch.note = text;
    await store.setDocData('today', TODAY, patch);
    toast(patch.wake ? `Aufstehzeit ${patch.wake} übernommen` : patch.departure ? `Abfahrt ${patch.departure} übernommen` : 'Heute aktualisiert');
  } else if (composeTag === 'todo' || composeTag === 'ziel') {
    await store.addDoc('agenda', { text, kind: composeTag, by: authorName(), ts });
  }
}
function renderChat(list) {
  const el = $('#chatScroll');
  const tagLabel = { todo: '📌 To-do', ziel: '📍 Ziel', wake: '⏰ Aufstehzeit' };
  const tagColor = { todo: '#c99a44', ziel: '#3f86c0', wake: '#b0483d' };
  el.innerHTML = list.map(m => {
    const mine = m.authorId === PROFILE.id;
    const pfp = pfpFor(m.authorId);
    const av = pfp ? `<img src="${pfp}" alt="">` : esc((m.author || '?')[0]);
    return `<div class="msg-row ${mine ? 'mine' : ''}">
      <div class="m-av" style="--mc:${m.authorColor || '#888'}">${av}</div>
      <div class="msg ${mine ? 'mine' : ''}">
        ${!mine ? `<div class="m-author" style="color:${m.authorColor || '#c99a44'}">${esc(m.author)}</div>` : ''}
        ${m.tag && m.tag !== 'msg' ? `<div class="m-tag" style="background:${tagColor[m.tag]}22;color:${tagColor[m.tag]}">${tagLabel[m.tag]}</div>` : ''}
        <div class="m-text">${esc(m.text)}</div>
        <div class="m-time">${fmtTime(m.ts)}</div>
      </div>
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
  // Gemerkten Standort nutzen, wenn frisch (<15 Min) — sonst neu bestimmen.
  if (LAST_POS && Date.now() - LAST_POS.ts < 15 * 60 * 1000) {
    build({ name: 'Aktueller Standort', lat: LAST_POS.lat, lng: LAST_POS.lng }); return;
  }
  if (navigator.geolocation) {
    $('#routeOptimize').textContent = 'Bestimme Standort…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        $('#routeOptimize').textContent = '🧭 Schnellste Route berechnen';
        LAST_POS = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        try { localStorage.setItem('usareise.lastPos', JSON.stringify(LAST_POS)); } catch {}
        build({ name: 'Aktueller Standort', lat: LAST_POS.lat, lng: LAST_POS.lng });
      },
      () => { $('#routeOptimize').textContent = '🧭 Schnellste Route berechnen'; build(LAST_POS ? { name: 'Letzter Standort', lat: LAST_POS.lat, lng: LAST_POS.lng } : null); },
      { enableHighAccuracy: true, timeout: 8000 });
  } else build(LAST_POS ? { name: 'Letzter Standort', lat: LAST_POS.lat, lng: LAST_POS.lng } : null);
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
  if (page === 'chat') markChatRead(); // Ungelesen-Zähler zurücksetzen
}
function revealOnScroll() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$('#page-home .reveal').forEach(el => io.observe(el));
}

function confBadge(p) {
  const c = p.confidence;
  if (c === 'gps') return `<span class="conf ok" title="${esc(p.reason || '')}">📍 GPS-genau</span>`;
  if (c === 'gps-near') return `<span class="conf ok" title="${esc(p.reason || '')}">📍 GPS (nahe)</span>`;
  if (c === 'time') return `<span class="conf warn" title="${esc(p.reason || '')}">🗓 nach Reiseplan · prüfen</span>`;
  if (c === 'date') return `<span class="conf warn" title="${esc(p.reason || '')}">🗓 per Datum · bitte prüfen</span>`;
  return '';
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
  // Intro nur beim ersten Start (bzw. alle 6 h) — danach direkt in die App (viel schneller).
  const lastIntro = +(localStorage.getItem('usareise.introAt') || 0);
  const recent = Date.now() - lastIntro < 6 * 60 * 60 * 1000;
  if (window.gsap && !recent) { localStorage.setItem('usareise.introAt', String(Date.now())); runIntro(); }
  else { $('#intro').classList.add('hidden'); afterIntro(); }
})();

// Service Worker + automatisches Update auf ALLEN Geräten:
// - beim Öffnen und alle 60 s wird auf eine neue Version geprüft
// - sobald eine neue Version aktiv ist, lädt die App sich einmal von selbst neu
//   (nicht beim allerersten Start → kein Flackern)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update();
    setInterval(() => reg.update(), 60000);
    // auch beim Zurückholen der App in den Vordergrund prüfen
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  }).catch(() => {});
}

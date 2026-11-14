import { LANGS, TEXTS } from './i18n.js';
import { PAGES, SIZES } from './render.js';
import { loadStats, renderStats } from './stats.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_ACCENT = '#ffd100';
const LAYOUT_NAMES = { a: 'layoutA', c: 'layoutC', d: 'layoutD' };
// Größe eines Layouts mit der eingestellten Skalierung, so wie OBS sie braucht
const sizeOf = (id) => SIZES[id].map((n) => Math.ceil((n * settings.scale) / 100));

// Sitzung abgelaufen: zurück zum Login
const toLogin = () => (location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`);

let settings = await fetch('/api/settings').then((r) => r.json());
let previewPage = ''; // leer = automatischer Wechsel
let uiLang = [new URLSearchParams(location.search).get('lang'), localStorage.getItem('lang'), navigator.language.slice(0, 2)].find((l) => LANGS.includes(l)) || 'en';

const langOptions = LANGS.map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join('');
$('editorLang').innerHTML = langOptions;
$('overlayLang').innerHTML = langOptions;
$('discordLang').innerHTML = langOptions;
$('region').innerHTML = ['eu', 'us', 'kr', 'tw'].map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join('');

let saveTimer;
let saveFailed = false;
let dataStatus = 'demo';
// Discord: der Server sagt nur, ob ein Webhook gesetzt ist, den Link selbst nie
let discord = { connected: false, note: '' };

// Zeigt im Kopf, ob echte Daten oder Beispieldaten laufen
async function loadStatus() {
  const state = await fetch('/api/state').then((r) => r.json()).catch(() => null);
  dataStatus = state?.status ?? 'offline';
  drawControls();
}
function save(changes) {
  settings = { ...settings, ...changes };
  drawControls();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => null);
    if (res?.status === 401) return toLogin();
    saveFailed = !res?.ok;
    if (res?.ok) settings = await res.json();
    drawControls();
  }, 250);
}

function linkRow(label, path) {
  const url = location.origin + path;
  const t = TEXTS[uiLang];
  const row = document.createElement('div');
  row.className = 'link';
  row.innerHTML = `<span></span><div class="row"><input readonly /><button type="button"></button></div>`;
  row.querySelector('span').textContent = label;
  row.querySelector('input').value = url;
  const button = row.querySelector('button');
  button.textContent = t.copy;
  button.addEventListener('click', async () => {
    // Ohne https (z. B. über die IP im Netzwerk) gibt der Browser die Zwischenablage nicht frei
    if (navigator.clipboard) await navigator.clipboard.writeText(url);
    else {
      row.querySelector('input').select();
      document.execCommand('copy');
    }
    button.textContent = t.copied;
    setTimeout(() => (button.textContent = t.copy), 1500);
  });
  return row;
}

// WoW Forever hat kein Mythisch+, dort heißt die Seite Dungeon
const pageName = (t, page) => (page === 'mplus' && settings.game === 'forever' ? t.dungeon : t[page]);

function drawControls() {
  const t = TEXTS[uiLang];
  const [w, h] = sizeOf(settings.layout);
  document.documentElement.lang = uiLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t[el.dataset.i18n]));
  const status = saveFailed ? 'saveError' : { loading: 'dataLoading' }[dataStatus] ?? dataStatus;
  $('status').textContent = $('status').title = t[status];
  $('status').classList.toggle('err', saveFailed || ['notFound', 'offline', 'noKey'].includes(dataStatus));
  $('status').classList.toggle('ok', !saveFailed && dataStatus === 'live');
  $('intro').setAttribute('aria-label', t.loading);
  $('editorLang').setAttribute('aria-label', t.langLabel);
  $('editorLang').value = uiLang;
  $('overlayLang').value = settings.lang;
  $('region').value = settings.region;
  $('game').value = settings.game;
  // Forever hat keine Realms, dort heißt das Feld Nachname
  $('realmLabel').textContent = settings.game === 'forever' ? t.surname : t.realm;
  // Forever hat nur eine Schwierigkeit, Farben pro Schwierigkeit ergeben dort keinen Sinn
  $('diffColors').closest('label').hidden = settings.game === 'forever';
  $('accent').value = settings.accent;
  $('diffColors').value = settings.diffColors ? 'on' : 'off';
  $('discordStyle').value = settings.discordStyle;
  $('discordLang').value = settings.discordLang;
  $('discordConnect').hidden = discord.connected;
  $('discordRemove').hidden = !discord.connected;
  $('discordTest').disabled = !discord.connected;
  $('discordState').textContent = discord.note ? t[discord.note] : t[discord.connected ? 'discordOn' : 'discordOff'];
  // Beim Tippen den Cursor nicht verlieren
  for (const id of ['name', 'realm', 'interval', 'scale']) if (document.activeElement !== $(id)) $(id).value = settings[id];

  $('layouts').replaceChildren(...Object.keys(SIZES).map((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.setAttribute('aria-pressed', id === settings.layout);
    button.innerHTML = `<span></span><small>${sizeOf(id)[0]} × ${sizeOf(id)[1]}</small>`;
    button.querySelector('span').textContent = t[LAYOUT_NAMES[id]];
    button.addEventListener('click', () => save({ layout: id }));
    return button;
  }));

  const enabled = PAGES.filter((page) => settings.pages[page]);
  $('pages').replaceChildren(...PAGES.map((page) => {
    const item = document.createElement('li');
    item.innerHTML = '<label><input type="checkbox" /><span></span></label>';
    const box = item.querySelector('input');
    box.checked = settings.pages[page];
    box.disabled = enabled.length === 1 && settings.pages[page]; // mindestens eine Seite bleibt an
    box.addEventListener('change', () => save({ pages: { ...settings.pages, [page]: box.checked } }));
    item.querySelector('span').textContent = pageName(t, page);
    return item;
  }));

  $('links').replaceChildren(linkRow(t.linkRotate, '/overlay'), ...PAGES.map((page) => linkRow(pageName(t, page), `/overlay/${page}`)));
  $('obsHint').textContent = t.obsHint.replace('{w}', w).replace('{h}', h);

  $('rail').setAttribute('aria-label', t.aViews);
  $('pagePicker').setAttribute('aria-label', t.preview);
  $('pagePicker').replaceChildren(...['', ...PAGES].map((page) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', page === previewPage);
    button.append(Object.assign(document.createElement('span'), { textContent: page ? pageName(t, page) : t.auto }));
    button.addEventListener('click', () => {
      previewPage = page;
      drawControls();
    });
    return button;
  }));
  if (tab === 'stats') renderStats(uiLang);
  else drawPreview();
}

function drawPreview() {
  const [w, h] = sizeOf(settings.layout);
  const frame = $('frame');
  const src = previewPage ? `/overlay/${previewPage}` : '/overlay';
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  const stage = $('stage');
  const area = stage.parentElement;
  const { paddingLeft, paddingRight, paddingTop, paddingBottom } = getComputedStyle(area);
  const available = area.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
  const margin = 16; // damit das Schachbrett rund um das Overlay sichtbar bleibt
  let scale = Math.min(1, (available - 2 * margin) / w);
  // Neben der Seitenleiste hat die Vorschau eine feste Höhe: hohe Layouts (Seitenleiste) ganz zeigen, Platz für den Hinweis lassen
  if (matchMedia('(min-width: 901px)').matches) {
    const availableHeight = area.clientHeight - parseFloat(paddingTop) - parseFloat(paddingBottom) - 40;
    scale = Math.min(scale, (availableHeight - 2 * margin) / h);
  }
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.style.transform = `translate(${margin}px, ${margin}px) scale(${scale})`;
  stage.style.width = `${w * scale + 2 * margin}px`;
  stage.style.height = `${h * scale + 2 * margin}px`;
}

// ---------- Ansichten: Overlay und Statistiken, wie bei FaceitWatchr ----------

let tab = 'overlay';
const VIEWS = ['overlay', 'stats'];
const viewOf = (name) => $(name === 'stats' ? 'statsView' : 'overlayView');
let switching = null;

// Wechsel wie ein Scroll: alte Ansicht gleitet nach oben weg, neue kommt von unten (rückwärts umgekehrt)
function slide(from, to) {
  const dir = VIEWS.indexOf(to) > VIEWS.indexOf(from) ? 1 : -1;
  const out = viewOf(from);
  const into = viewOf(to);
  switching?.cancel();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !out.animate) {
    out.hidden = true;
    showView(into);
    return;
  }
  const anim = out.animate(
    [{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${-dir * 60}px)`, opacity: 0, filter: 'blur(4px)' }],
    { duration: 220, easing: 'cubic-bezier(.5, 0, .2, 1)' },
  );
  switching = anim;
  anim.finished.then(() => {
    out.hidden = true;
    showView(into);
    switching = into.animate(
      [{ transform: `translateY(${dir * 80}px)`, opacity: 0, filter: 'blur(4px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
      { duration: 380, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    );
  }, () => {});
}

// Die Vorschau misst ihre Fläche, also erst zeichnen, wenn die Overlay-Ansicht sichtbar ist
function showView(view) {
  view.hidden = false;
  if (view.id === 'overlayView') drawPreview();
}

function setTab(next, animate = true) {
  const prev = tab;
  tab = next === 'stats' ? 'stats' : 'overlay';
  for (const button of document.querySelectorAll('.tabs [data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  for (const link of document.querySelectorAll('.rail [data-tab]')) {
    link.classList.toggle('active', link.dataset.tab === tab);
    link.classList.toggle('passed', VIEWS.indexOf(link.dataset.tab) < VIEWS.indexOf(tab));
    link.toggleAttribute('aria-current', link.dataset.tab === tab);
  }
  $('rail').style.setProperty('--fill', String(VIEWS.indexOf(tab) / (VIEWS.length - 1)));
  if (animate && prev !== tab) slide(prev, tab);
  else {
    viewOf(tab === 'stats' ? 'overlay' : 'stats').hidden = true;
    showView(viewOf(tab));
  }
  history.replaceState(null, '', tab === 'stats' ? '#stats' : location.pathname + location.search);
  if (tab === 'stats') loadStats(uiLang);
}

for (const button of document.querySelectorAll('.tabs [data-tab]')) button.addEventListener('click', () => setTab(button.dataset.tab));
for (const link of document.querySelectorAll('.rail [data-tab]')) {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    setTab(link.dataset.tab);
  });
}

// Mausrad wechselt die Ansicht wie bei FaceitWatchr: über der Vorschau nach unten = Statistiken,
// in den Statistiken ganz oben nach oben = Overlay. Die Seitenleiste scrollt weiter normal.
const wheelWide = matchMedia('(min-width: 1100px)');
let wheelSum = 0;
let wheelLock = 0;
let wheelReset = 0;
document.addEventListener('wheel', (e) => {
  if (!wheelWide.matches || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  if (e.target.closest('input, select, textarea, aside, .page-picker')) return;
  const down = e.deltaY > 0;
  const want =
    tab === 'overlay' && down && e.target.closest('.preview-area') ? 'stats'
    : tab === 'stats' && !down && $('statsView').scrollTop <= 0 ? 'overlay'
    : null;
  if (!want) {
    wheelSum = 0;
    return;
  }
  e.preventDefault();
  if (Date.now() < wheelLock) return;
  // Kleine Trackpad-Bewegungen sammeln, damit nicht jeder Hauch umschaltet
  wheelSum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  clearTimeout(wheelReset);
  wheelReset = setTimeout(() => (wheelSum = 0), 250);
  if (Math.abs(wheelSum) < 60) return;
  wheelSum = 0;
  wheelLock = Date.now() + 900;
  setTab(want);
}, { passive: false });

$('editorLang').addEventListener('change', (e) => {
  uiLang = e.target.value;
  localStorage.setItem('lang', uiLang);
  drawControls();
});
$('overlayLang').addEventListener('change', (e) => save({ lang: e.target.value }));
$('name').addEventListener('input', (e) => save({ name: e.target.value }));
$('realm').addEventListener('input', (e) => save({ realm: e.target.value }));
$('region').addEventListener('change', (e) => save({ region: e.target.value }));
$('game').addEventListener('change', (e) => save({ game: e.target.value }));
$('interval').addEventListener('change', (e) => save({ interval: Number(e.target.value) }));
$('scale').addEventListener('change', (e) => {
  // Gleich hier begrenzen, damit das Feld nach Enter den echten Wert zeigt; leer = 100 %
  e.target.value = Math.min(300, Math.max(50, Math.round(Number(e.target.value) || 100)));
  save({ scale: Number(e.target.value) });
});
$('accent').addEventListener('input', (e) => save({ accent: e.target.value }));
$('diffColors').addEventListener('change', (e) => save({ diffColors: e.target.value === 'on' }));
$('accentReset').addEventListener('click', () => save({ accent: DEFAULT_ACCENT }));
$('discordStyle').addEventListener('change', (e) => save({ discordStyle: e.target.value }));
$('discordLang').addEventListener('change', (e) => save({ discordLang: e.target.value }));

async function setDiscord(url) {
  const res = await fetch('/api/discord', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).catch(() => null);
  if (res?.status === 401) return toLogin();
  if (res?.ok) {
    discord = { ...(await res.json()), note: '' };
    $('discordUrl').value = '';
  } else discord.note = res?.status === 400 ? 'discordInvalid' : 'saveError';
  drawControls();
}
$('discordSave').addEventListener('click', () => setDiscord($('discordUrl').value));
$('discordUrl').addEventListener('keydown', (e) => e.key === 'Enter' && setDiscord($('discordUrl').value));
$('discordRemove').addEventListener('click', () => setDiscord(''));
$('discordTest').addEventListener('click', async () => {
  $('discordTest').disabled = true;
  const res = await fetch('/api/discord/test', { method: 'POST' }).catch(() => null);
  if (res?.status === 401) return toLogin();
  discord.note = res?.ok ? 'discordTestOk' : 'discordTestFail';
  drawControls();
  setTimeout(() => {
    discord.note = '';
    drawControls();
  }, 5000);
});
$('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login.html';
});
new ResizeObserver(drawPreview).observe($('stage').parentElement);

setTab(location.hash === '#stats' ? 'stats' : 'overlay', false);
drawControls();
loadStatus();
new EventSource('/api/events').addEventListener('settings', () => {
  loadStatus();
  if (tab === 'stats') loadStats(uiLang);
});
fetch('/api/discord').then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (d) discord = { connected: d.connected, note: '' };
  drawControls();
}, () => {});
const me = await fetch('/api/me').then((r) => r.json()).catch(() => null);
if (me?.user) $('accountName').textContent = me.user;
// Ohne Login (kein Passwort in der .env) gibt es nichts zum Abmelden
if (me && !me.loginEnabled) $('logout').hidden = true;

// Ladebildschirm ausblenden, sobald alles steht (mindestens so lange, bis das Logo aufgebaut ist)
setTimeout(() => $('intro').classList.add('done'), Math.max(0, 1300 - performance.now()));

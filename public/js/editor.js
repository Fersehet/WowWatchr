import { LANGS, TEXTS } from './i18n.js';
import { PAGES, SIZES } from './render.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_ACCENT = '#ffd100';
const LAYOUT_NAMES = { a: 'layoutA', c: 'layoutC', d: 'layoutD' };

// Sitzung abgelaufen: zurück zum Login
const toLogin = () => (location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`);

$('intro').querySelector('.intro-bar i').style.setProperty('--p', 0.6);
let settings = await fetch('/api/settings').then((r) => r.json());
let previewPage = ''; // leer = automatischer Wechsel
let uiLang = [new URLSearchParams(location.search).get('lang'), localStorage.getItem('lang'), navigator.language.slice(0, 2)].find((l) => LANGS.includes(l)) || 'en';

const langOptions = LANGS.map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join('');
$('editorLang').innerHTML = langOptions;
$('overlayLang').innerHTML = langOptions;
$('region').innerHTML = ['eu', 'us', 'kr', 'tw'].map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join('');

let saveTimer;
let saveFailed = false;
let dataStatus = 'demo';

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
    await navigator.clipboard.writeText(url);
    button.textContent = t.copied;
    setTimeout(() => (button.textContent = t.copy), 1500);
  });
  return row;
}

function drawControls() {
  const t = TEXTS[uiLang];
  const [w, h] = SIZES[settings.layout];
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
  $('accent').value = settings.accent;
  // Beim Tippen den Cursor nicht verlieren
  for (const id of ['name', 'realm', 'interval']) if (document.activeElement !== $(id)) $(id).value = settings[id];

  $('layouts').replaceChildren(...Object.keys(SIZES).map((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.setAttribute('aria-pressed', id === settings.layout);
    button.innerHTML = `<span></span><small>${SIZES[id][0]} × ${SIZES[id][1]}</small>`;
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
    item.querySelector('span').textContent = t[page];
    return item;
  }));

  $('links').replaceChildren(linkRow(t.linkRotate, '/overlay'), ...PAGES.map((page) => linkRow(t[page], `/overlay/${page}`)));
  $('obsHint').textContent = t.obsHint.replace('{w}', w).replace('{h}', h);

  $('tabs').setAttribute('aria-label', t.preview);
  $('tabs').replaceChildren(...['', ...PAGES].map((page) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', page === previewPage);
    button.textContent = page ? t[page] : t.auto;
    button.addEventListener('click', () => {
      previewPage = page;
      drawControls();
    });
    return button;
  }));
  drawPreview();
}

function drawPreview() {
  const [w, h] = SIZES[settings.layout];
  const frame = $('frame');
  const src = previewPage ? `/overlay/${previewPage}` : '/overlay';
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  const stage = $('stage');
  const { paddingLeft, paddingRight } = getComputedStyle(stage.parentElement);
  const available = stage.parentElement.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
  const margin = 16; // damit das Schachbrett rund um das Overlay sichtbar bleibt
  const scale = Math.min(1, (available - 2 * margin) / w);
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.style.transform = `translate(${margin}px, ${margin}px) scale(${scale})`;
  stage.style.width = `${w * scale + 2 * margin}px`;
  stage.style.height = `${h * scale + 2 * margin}px`;
}

$('editorLang').addEventListener('change', (e) => {
  uiLang = e.target.value;
  localStorage.setItem('lang', uiLang);
  drawControls();
});
$('overlayLang').addEventListener('change', (e) => save({ lang: e.target.value }));
$('name').addEventListener('input', (e) => save({ name: e.target.value }));
$('realm').addEventListener('input', (e) => save({ realm: e.target.value }));
$('region').addEventListener('change', (e) => save({ region: e.target.value }));
$('interval').addEventListener('change', (e) => save({ interval: Number(e.target.value) }));
$('accent').addEventListener('input', (e) => save({ accent: e.target.value }));
$('accentReset').addEventListener('click', () => save({ accent: DEFAULT_ACCENT }));
$('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login.html';
});
new ResizeObserver(drawPreview).observe($('stage').parentElement);

drawControls();
loadStatus();
new EventSource('/api/events').addEventListener('settings', loadStatus);
const me = await fetch('/api/me').then((r) => r.json()).catch(() => null);
if (me?.user) $('accountName').textContent = me.user;

// Ladebildschirm ausblenden, sobald alles steht (mindestens so lange, bis das Logo aufgebaut ist)
$('intro').querySelector('.intro-bar i').style.setProperty('--p', 1);
setTimeout(() => $('intro').classList.add('done'), Math.max(0, 1300 - performance.now()));

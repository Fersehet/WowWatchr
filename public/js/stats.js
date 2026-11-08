// Statistik-Tab im Editor, aufgebaut wie bei FaceitWatchr: Diagramm und Saison oben, darunter die letzten Dungeons und Raids.
// Die Runs kommen aus /api/stats, also aus dem Verlauf, den der Server speichert (Blizzard kennt nur den besten Run pro Dungeon).
import { TEXTS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const LOCALES = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU', fr: 'fr-FR' };
const API_LOCALES = { de: 'de_DE', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' };
const DIFFS = ['normal', 'heroic', 'mythic'];

let data = null;
let state = null;
let lang = 'en';
const open = new Set(); // aufgeklappte Zeilen bleiben beim Neuzeichnen offen
let autoOpened = false;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Blizzard-Namen gibt es in allen Sprachen, Beispieldaten teils nur als Text */
const name = (names) => (typeof names === 'string' ? names : names?.[API_LOCALES[lang]] ?? names?.en_US ?? '');
const num = (n, digits = 0) => n.toLocaleString(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const day = (ts) => new Date(ts).toLocaleDateString(LOCALES[lang], { day: '2-digit', month: '2-digit' });
const dayTime = (ts) => new Date(ts).toLocaleString(LOCALES[lang], { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

export async function loadStats(uiLang) {
  lang = uiLang;
  const [stats, overlay] = await Promise.all([
    fetch('/api/stats', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/state', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (stats) data = stats;
  if (overlay) state = overlay;
  renderStats(uiLang);
}

export function renderStats(uiLang) {
  lang = uiLang;
  const t = TEXTS[lang];
  // Pro Dungeon zählt der neueste gespeicherte Run, das ist der aktuelle Bestwert bei Blizzard
  const best = new Map();
  for (const run of data?.runs ?? []) if (!best.has(run.dungeonId)) best.set(run.dungeonId, run);
  renderChart(t, [...best.values()]);
  renderSeason(t);
  renderList(t);
}

function renderChart(t, runs) {
  const m = state?.mplus;
  $('chartHead').textContent = t.stMplusHead;
  $('chartScore').textContent = m ? num(m.score) : '–';
  $('trBest').textContent = m?.bestKey ? `+${m.bestKey}` : '–';
  $('trTimed').textContent = m ? `${m.timed} / ${m.total}` : '–';
  $('trAvg').textContent = runs.length ? num(runs.reduce((s, r) => s + r.key, 0) / runs.length, 1) : '–';
  $('chartNote').textContent = t.stChartNote;

  const chart = $('ratingChart');
  const W = 600, H = 220, left = 40, right = 8, top = 22, bottom = 28;
  if (!runs.length) {
    chart.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="empty">${esc(t.stNoRuns)}</text>`;
    chart.setAttribute('aria-label', t.stNoRuns);
    return;
  }
  const sorted = runs.toSorted((a, b) => name(a.dungeon).localeCompare(name(b.dungeon), LOCALES[lang]));
  const step = 100;
  const max = Math.max(step, Math.ceil(Math.max(...sorted.map((r) => r.rating)) / step) * step);
  const y = (v) => top + (1 - v / max) * (H - top - bottom);
  const slot = (W - left - right) / sorted.length;
  const bar = Math.min(56, slot - 12);
  let svg = '';
  for (let v = 0; v <= max; v += step) {
    svg += `<line class="grid-line" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  sorted.forEach((run, i) => {
    const x = left + i * slot + (slot - bar) / 2;
    const label = name(run.dungeon);
    svg += `<rect class="bar${run.result < 0 ? ' over' : ''}" x="${x}" y="${y(run.rating)}" width="${bar}" height="${y(0) - y(run.rating)}" rx="3"><title>${esc(label)} +${run.key} · ${num(run.rating, 1)}</title></rect>`;
    svg += `<text class="key" x="${x + bar / 2}" y="${y(run.rating) - 6}" text-anchor="middle">+${run.key}</text>`;
    svg += `<text x="${x + bar / 2}" y="${H - 8}" text-anchor="middle">${esc(label.replace(/^(The|Die|Der|Das|La|Le|Les|L’|L') ?/i, '').slice(0, 7))}</text>`;
  });
  chart.innerHTML = svg;
  chart.setAttribute('aria-label', t.stMplusHead);
}

function renderSeason(t) {
  const m = state?.mplus;
  const r = state?.raid;
  $('seasonHead').textContent = t.stSeason;
  $('seasonName').textContent = r?.name ?? '';
  $('ssScore').textContent = m ? num(m.score) : '–';
  $('ssBest').textContent = m?.bestKey ? `+${m.bestKey}` : '–';
  $('ssTimed').textContent = m ? `${m.timed} / ${m.total}` : '–';
  const done = r?.difficulties.filter((d) => d.killed > 0).map((d) => `${d.killed}/${r.bosses} ${t.diffShort[d.id]}`) ?? [];
  $('ssRaid').textContent = done.slice(-2).join(' · ') || '–';
  $('ssKills').textContent = r ? num(r.difficulties.reduce((s, d) => s + d.kills, 0)) : '–';
  $('seasonNote').textContent = data?.demo ? t.stDemoNote : t.stSeasonNote;
}

function runRow(t, run) {
  const id = `run-${run.dungeonId}-${run.at}`;
  const result = run.result > 0 ? `<span class="res up">${fill(t.stInTime, { n: '+'.repeat(run.result) })}</span>` : `<span class="res down">${esc(t.stOverTime)}</span>`;
  const diff = run.limit - run.ms;
  const pct = run.limit ? Math.min(100, (run.ms / run.limit) * 100) : 0;
  const detail = `
    ${run.limit ? `<div class="timer"><div class="timer-bar"><i class="${run.result < 0 ? 'over' : ''}" style="width:${pct}%"></i></div>
      <div class="timer-meta"><span>${mmss(run.ms)} / ${mmss(run.limit)}</span><span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '−' : '+'}${mmss(Math.abs(diff))}</span></div></div>` : ''}
    <dl class="facts">
      <div><dt>${esc(t.stKey)}</dt><b class="gold">+${run.key}</b></div>
      <div><dt>${esc(t.stResult)}</dt><b class="${run.result > 0 ? 'up' : 'down'}">${run.result > 0 ? `+${run.result}` : esc(t.stDepleted)}</b></div>
      <div><dt>${esc(t.stRunRating)}</dt><b>${run.rating ? num(run.rating, 1) : '–'}</b></div>
      <div><dt>${esc(t.stPlayed)}</dt><b>${esc(dayTime(run.at))}</b></div>
    </dl>
    ${run.affixes.length ? `<div class="sub">${esc(t.stAffixes)} · ${run.affixes.map((a) => esc(name(a))).join(' · ')}</div>` : ''}
    <div class="party">${run.members.map((m) => `<div class="${state?.character && m.name === state.character.name.split(' ')[0] ? 'me' : ''}"><strong>${esc(m.name)}</strong><span>${esc(name(m.spec))}</span><span>${esc(name(m.realm))}</span><span>${esc(t.ilvl)} ${m.ilvl}</span></div>`).join('')}</div>`;
  return { id, at: run.at, html: () => row(id, `<span class="badge key">+${run.key}</span>`, name(run.dungeon), `${mmss(run.ms)} · ${fill(t.stPlayers, { n: run.members.length })}`, result, run.at, detail) };
}

/** Boss-Tabelle mit allen Kills pro Schwierigkeit, wie Blizzard sie führt */
function bossTable(t, raid) {
  return `<div class="tablewrap"><table class="bosses"><thead><tr><th>${esc(t.stBoss)}</th>${DIFFS.map((d) => `<th>${esc(t.diff[d])}</th>`).join('')}<th>${esc(t.stLastKill)}</th></tr></thead><tbody>
    ${raid.bosses.map((b) => `<tr><td>${esc(name(b.name))}</td>${DIFFS.map((d) => `<td class="${b.kills[d] ? '' : 'zero'}">${b.kills[d]}×</td>`).join('')}<td>${b.last ? day(b.last) : '–'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

const raidBadge = (t) => `<span class="badge raid">${esc(t.stRaidBadge)}</span>`;

/**
 * Raid-Abende: neue Kills zwischen zwei Abfragen, nach Tag zusammengefasst, eine Zeile pro Abend.
 * Versuche und Kampfzeiten kennt Blizzard nicht. Ohne gespeicherte Abende (frisch eingerichtet) eine Zeile pro Raid.
 */
function raidRows(t, raid) {
  const nights = new Map();
  for (const k of data?.kills ?? []) {
    if (name(k.raid) !== name(raid.name)) continue;
    const key = new Date(k.at).toDateString();
    if (!nights.has(key)) nights.set(key, { at: k.at, kills: [] });
    nights.get(key).kills.push(k);
  }
  if (nights.size) {
    return [...nights.entries()].map(([key, night]) => {
      const id = `raid-${raid.id}-${key}`;
      const bosses = new Set(night.kills.map((k) => name(k.boss))).size;
      const diffs = DIFFS.filter((d) => night.kills.some((k) => k.difficulty === d)).map((d) => t.diff[d]).join(' · ');
      const detail = `
        <div class="sub">${esc(t.stFallen)}</div>
        <ul class="fallen">${night.kills.map((k) => `<li><span>${esc(name(k.boss))}</span><b>${esc(t.diff[k.difficulty])}${k.count > 1 ? ` ×${k.count}` : ''}</b></li>`).join('')}</ul>
        <div class="sub">${esc(t.stProgress)}</div>${bossTable(t, raid)}`;
      return { id, at: night.at, html: () => row(id, raidBadge(t), name(raid.name), diffs, `<span class="res gold">${esc(bosses === 1 ? t.stBossOne : fill(t.stBosses, { n: bosses }))}</span>`, night.at, detail) };
    });
  }
  const id = `raid-${raid.id}`;
  const total = raid.bosses.length;
  const last = Math.max(0, ...raid.bosses.map((b) => b.last));
  const kills = raid.bosses.reduce((s, b) => s + DIFFS.reduce((a, d) => a + b.kills[d], 0), 0);
  const progress = DIFFS.map((d) => `${raid.bosses.filter((b) => b.kills[d] > 0).length}/${total} ${t.diffShort[d]}`).join(' · ');
  const detail = `${bossTable(t, raid)}<p class="example">${esc(t.stNightsSoon)}</p>`;
  return [{ id, at: last, html: () => row(id, raidBadge(t), name(raid.name), progress, `<span class="res gold">${esc(kills === 1 ? t.stKillOne : fill(t.stKills, { n: num(kills) }))}</span>`, last, detail) }];
}

function row(id, badge, title, sub, result, at, detail) {
  const isOpen = open.has(id);
  return `<li class="${isOpen ? 'open' : ''}" data-id="${esc(id)}">
    <button class="run-row" type="button" aria-expanded="${isOpen}">${badge}<span class="title"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${result}<span class="when">${at ? day(at) : ''}</span><i class="chev" aria-hidden="true"></i></button>
    <div class="detail"${isOpen ? '' : ' hidden'}>${detail}</div></li>`;
}

function renderList(t) {
  $('listHead').textContent = t.stListHead;
  $('listHint').textContent = t.stListHint;
  const rows = [
    ...(data?.runs ?? []).map((run) => runRow(t, run)),
    ...(data?.raids ?? []).filter((raid) => raid.bosses.some((b) => b.last)).flatMap((raid) => raidRows(t, raid)),
  ].sort((a, b) => b.at - a.at);
  // Beim ersten Öffnen ist der neueste Eintrag aufgeklappt
  if (!autoOpened && rows.length) {
    open.add(rows[0].id);
    autoOpened = true;
  }
  $('runList').innerHTML = rows.map((r) => r.html()).join('') || `<li class="empty">${esc(t.stNoRuns)}</li>`;
}

$('runList').addEventListener('click', (e) => {
  const button = e.target.closest('.run-row');
  if (!button) return;
  const li = button.parentElement;
  const isOpen = li.classList.toggle('open');
  button.setAttribute('aria-expanded', String(isOpen));
  li.querySelector('.detail').hidden = !isOpen;
  if (isOpen) open.add(li.dataset.id);
  else open.delete(li.dataset.id);
});

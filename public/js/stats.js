// Statistik-Tab im Editor, aufgebaut wie bei FaceitWatchr: Diagramm und Saison oben, darunter die letzten Dungeons und Raids.
// Die Runs kommen aus /api/stats, also aus dem Verlauf, den der Server speichert (Blizzard kennt nur den besten Run pro Dungeon).
import { TEXTS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const LOCALES = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU', fr: 'fr-FR' };
const API_LOCALES = { de: 'de_DE', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' };
const DIFFS = ['normal', 'heroic', 'mythic'];
/** Letzter Kill eines Bosses über alle Schwierigkeiten */
const lastKill = (boss) => Math.max(0, ...DIFFS.map((d) => boss.last?.[d] ?? 0));

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
  // Nur die neueste Saison, ältere Bestwerte bleiben in der Liste
  const season = Math.max(0, ...(data?.runs ?? []).map((r) => r.season ?? 0));
  for (const run of data?.runs ?? []) if ((run.season ?? 0) === season && !best.has(run.dungeonId)) best.set(run.dungeonId, run);
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
  const W = 600, H = 236, left = 40, right = 8, top = 22, bottom = 44;
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
    // Beim Hovern steht die Wertung des Runs als Zahl im Balken
    svg += `<g class="col"><rect class="bar${run.result < 0 ? ' over' : ''}" x="${x}" y="${y(run.rating)}" width="${bar}" height="${y(0) - y(run.rating)}" rx="3"><title>${esc(label)} +${run.key} · ${num(run.rating, 1)}</title></rect>`;
    // Zu flacher Balken: Zahl über dem Key statt darin
    const inside = y(0) - y(run.rating) >= 22;
    svg += `<text class="val${inside ? '' : ' out'}" x="${x + bar / 2}" y="${inside ? y(run.rating) + 16 : y(run.rating) - 20}" text-anchor="middle">${num(run.rating, 1)}</text></g>`;
    svg += `<text class="key" x="${x + bar / 2}" y="${y(run.rating) - 6}" text-anchor="middle">+${run.key}</text>`;
    const [one, two] = twoLines(label, Math.max(6, Math.floor(slot / 7)));
    svg += `<text x="${x + bar / 2}" y="${H - 24}" text-anchor="middle">${esc(one)}${two ? `<tspan x="${x + bar / 2}" dy="14">${esc(two)}</tspan>` : ''}<title>${esc(label)}</title></text>`;
  });
  chart.innerHTML = svg;
  chart.setAttribute('aria-label', t.stMplusHead);
}

/** Dungeon-Name auf höchstens zwei Zeilen, an Wortgrenzen; nur was dann noch zu lang ist, wird gekürzt */
function twoLines(label, max) {
  const cut = (text) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  const words = label.split(' ');
  if (label.length <= max || words.length === 1) return [cut(label), ''];
  // Trennstelle, an der die längere Zeile am kürzesten ist
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const len = (k) => Math.max(words.slice(0, k).join(' ').length, words.slice(k).join(' ').length);
    if (len(i) < len(best)) best = i;
  }
  return [cut(words.slice(0, best).join(' ')), cut(words.slice(best).join(' '))];
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
    ${run.members.length ? `<div class="party">${run.members.map((m) => `<div class="${state?.character && m.name === state.character.name.split(' ')[0] ? 'me' : ''}"><strong>${esc(m.name)}</strong><span>${esc(name(m.spec))}</span><span>${esc(name(m.realm))}</span><span>${esc(t.ilvl)} ${m.ilvl}</span></div>`).join('')}</div>` : ''}
    ${run.log ? logBlock(t, run.log.code, run.log.fight) : ''}`;
  const sub = [mmss(run.ms), run.members.length ? fill(t.stPlayers, { n: run.members.length }) : '', run.log ? t.stLogs : ''].filter(Boolean).join(' · ');
  return { id, at: run.at, html: () => row(id, `<span class="badge key">+${run.key}</span>`, name(run.dungeon), sub, result, run.at, detail) };
}

// ---------- Warcraft Logs ----------

const WCL_DIFF = { 3: 'normal', 4: 'heroic', 5: 'mythic' };
const fightStats = new Map(); // code-fight -> Spielerwerte, 'error' oder ein laufender Abruf

/** Platzhalter für die Spielerwerte eines Kampfes, gefüllt beim Aufklappen */
function logBlock(t, code, fight, head = true) {
  return `${head ? `<div class="sub">${esc(t.stLogs)}</div>` : ''}<div class="log-stats" data-code="${esc(code)}" data-fight="${Number(fight)}">${statsTable(t, code, fight)}</div>`;
}

function statsTable(t, code, fight) {
  const stats = fightStats.get(`${code}-${fight}`);
  if (stats === 'error') return `<p class="example">${esc(t.stLogsError)}</p>`;
  if (!Array.isArray(stats)) return `<p class="example">${esc(t.loading)}</p>`;
  if (!stats.length) return `<p class="example">${esc(t.stNoLogStats)}</p>`;
  const me = state?.character?.name.split(' ')[0];
  return `<div class="tablewrap"><table class="bosses players"><thead><tr><th>${esc(t.stPlayer)}</th><th>${esc(t.stDps)}</th><th>${esc(t.stHps)}</th><th>${esc(t.stDeaths)}</th><th>${esc(t.stInterrupts)}</th><th>${esc(t.stParse)}</th></tr></thead><tbody>
    ${stats.map((p) => `<tr class="${p.name === me ? 'me' : ''}"><td>${esc(p.name)}</td><td>${num(p.dps)}</td><td>${num(p.hps)}</td><td class="${p.deaths ? 'down' : 'zero'}">${p.deaths}</td><td>${p.interrupts}</td><td>${p.parse == null ? '–' : `<span class="parse" style="--p:${parseColor(p.parse)}">${p.parse}</span>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// Farben wie bei Warcraft Logs: grau, grün, blau, lila, orange, pink, gold
const parseColor = (p) => (p >= 100 ? '#e5cc80' : p >= 99 ? '#e268a8' : p >= 95 ? '#ff8000' : p >= 75 ? '#a335ee' : p >= 50 ? '#0070ff' : p >= 25 ? '#1eff00' : '#9d9d9d');

/** Lädt die Spielerwerte für alle sichtbaren Platzhalter in einer aufgeklappten Zeile */
function loadFightStats(root) {
  for (const box of root.querySelectorAll('.log-stats')) {
    const key = `${box.dataset.code}-${box.dataset.fight}`;
    // Nur sichtbare Kämpfe abfragen, das schont das Abfrage-Kontingent bei Warcraft Logs
    if (fightStats.has(key) || box.closest('[hidden]')) continue;
    fightStats.set(key, 'loading');
    fetch(`/api/stats/fight?code=${encodeURIComponent(box.dataset.code)}&fight=${box.dataset.fight}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((stats) => fightStats.set(key, stats), () => fightStats.set(key, 'error'))
      .finally(() => {
        const t = TEXTS[lang];
        for (const el of document.querySelectorAll(`.log-stats[data-code="${box.dataset.code}"][data-fight="${box.dataset.fight}"]`)) el.innerHTML = statsTable(t, box.dataset.code, box.dataset.fight);
      });
  }
}

const hmm = (ms) => {
  const m = Math.round(ms / 60000);
  return fill(TEXTS[lang].stHours, { t: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` });
};

/** Ein Raid-Abend aus Warcraft Logs: Versuche, Kampfzeiten und Werte pro Spieler je Boss */
function logRaidRow(t, report) {
  const id = `log-${report.code}-${report.start}`;
  const fights = report.fights.filter((f) => WCL_DIFF[f.difficulty] && f.keyLevel == null);
  const bosses = new Map();
  for (const f of fights) {
    const key = `${f.encounterId}-${f.difficulty}`;
    if (!bosses.has(key)) bosses.set(key, { name: f.name, difficulty: WCL_DIFF[f.difficulty], tries: [], kill: null });
    const b = bosses.get(key);
    b.tries.push(f);
    if (f.kill) b.kill = f;
  }
  const list = [...bosses.values()];
  const killed = list.filter((b) => b.kill).length;
  const length = fights.length ? Math.max(...fights.map((f) => f.end)) - Math.min(...fights.map((f) => f.start)) : 0;
  const wipes = fights.filter((f) => !f.kill).length;
  const diffs = [...new Set(list.map((b) => t.diff[b.difficulty]))].join(' · ');
  const detail = `
    <dl class="facts">
      <div><dt>${esc(t.stRaidLength)}</dt><b>${hmm(length)}</b></div>
      <div><dt>${esc(t.stFallen)}</dt><b class="gold">${killed} / ${list.length}</b></div>
      <div><dt>${esc(t.stTries)}</dt><b>${fights.length}</b></div>
      <div><dt>${esc(t.stWipes)}</dt><b class="${wipes ? 'down' : ''}">${wipes}</b></div>
    </dl>
    <div class="tablewrap"><table class="bosses"><thead><tr><th>${esc(t.stBoss)}</th><th>${esc(t.stDifficulty)}</th><th>${esc(t.stTries)}</th><th>${esc(t.stBestTry)}</th><th>${esc(t.stKillTime)}</th><th>${esc(t.stTimeOnBoss)}</th></tr></thead><tbody>
      ${list.map((b, i) => {
        const best = Math.min(...b.tries.filter((f) => !f.kill && f.percent != null).map((f) => f.percent));
        return `<tr class="pick${i ? '' : ' picked'}" data-pick="${i}" tabindex="0"><td>${esc(name(b.name))}</td><td>${esc(t.diff[b.difficulty])}</td><td>${b.tries.length}</td><td>${b.kill ? `<span class="up">${esc(t.stKilled)}</span>` : Number.isFinite(best) ? `${num(best, 1)} %` : '–'}</td><td>${b.kill ? mmss(b.kill.end - b.kill.start) : '–'}</td><td>${mmss(b.tries.reduce((s, f) => s + f.end - f.start, 0))}</td></tr>`;
      }).join('')}
    </tbody></table></div>
    ${list.map((b, i) => { const f = b.kill ?? b.tries.at(-1); return `<div class="boss-stats" data-boss="${i}"${i ? ' hidden' : ''}><div class="sub">${esc(name(b.name))} · ${esc(b.kill ? t.stKill : t.stLastTry)}</div>${logBlock(t, report.code, f.id, false)}</div>`; }).join('')}`;
  return { id, at: report.end, day: new Date(report.start).toDateString(), html: () => row(id, raidBadge(t), name(report.zone), `${diffs} · ${hmm(length)} · ${t.stLogs}`, `<span class="res gold">${esc(killed === 1 ? t.stBossOne : fill(t.stBosses, { n: killed }))}</span>`, report.start, detail) };
}

/** Dungeons aus Warcraft Logs: an den passenden Blizzard-Run hängen, sonst eigene Zeile */
function withLogs(runs, reports) {
  const out = runs.map((run) => ({ ...run }));
  for (const report of reports) {
    // Nur der Kampf für den ganzen Dungeon hat eine Key-Zeit, einzelne Boss-Kämpfe nicht
    for (const f of report.fights.filter((x) => x.keyLevel != null && x.keyTime != null)) {
      const at = report.start + f.end;
      const match = out.find((r) => !r.log && r.key === f.keyLevel && Math.abs(r.at - at) < 20 * 60_000);
      if (match) match.log = { code: report.code, fight: f.id };
      else out.push({ at, dungeonId: `log-${f.encounterId}`, dungeon: f.name, key: f.keyLevel, ms: f.keyTime, limit: 0, result: f.keyBonus > 0 ? f.keyBonus : -1, rating: 0, affixes: [], members: [], log: { code: report.code, fight: f.id } });
    }
  }
  return out;
}

/** Boss-Tabelle mit allen Kills pro Schwierigkeit, wie Blizzard sie führt */
function bossTable(t, raid) {
  return `<div class="tablewrap"><table class="bosses"><thead><tr><th>${esc(t.stBoss)}</th>${DIFFS.map((d) => `<th>${esc(t.diff[d])}</th>`).join('')}<th>${esc(t.stLastKill)}</th></tr></thead><tbody>
    ${raid.bosses.map((b) => `<tr><td>${esc(name(b.name))}</td>${DIFFS.map((d) => `<td class="${b.kills[d] ? '' : 'zero'}">${b.kills[d]}×</td>`).join('')}<td>${lastKill(b) ? day(lastKill(b)) : '–'}</td></tr>`).join('')}
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
  const last = Math.max(0, ...raid.bosses.map(lastKill));
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
  const reports = data?.logs?.reports ?? [];
  const logRaids = reports.filter((r) => r.fights.some((f) => WCL_DIFF[f.difficulty] && f.keyLevel == null)).map((r) => logRaidRow(t, r));
  // Gibt es für einen Tag ein Log, ersetzt es den Raid-Abend aus den Blizzard-Kills
  const logged = new Set(logRaids.map((r) => r.day));
  const rows = [
    ...withLogs(data?.runs ?? [], reports).map((run) => runRow(t, run)),
    ...logRaids,
    ...(data?.raids ?? []).filter((raid) => raid.bosses.some(lastKill)).flatMap((raid) => raidRows(t, raid)).filter((r) => !logged.has(new Date(r.at).toDateString())),
  ].sort((a, b) => b.at - a.at);
  // Beim ersten Öffnen ist der neueste Eintrag aufgeklappt
  if (!autoOpened && rows.length) {
    open.add(rows[0].id);
    autoOpened = true;
  }
  $('runList').innerHTML = rows.map((r) => r.html()).join('') || `<li class="empty">${esc(t.stNoRuns)}</li>`;
  for (const li of $('runList').querySelectorAll('li.open')) loadFightStats(li);
}

// Boss in einem Raid-Abend anklicken: dessen Spielerwerte zeigen
function pickBoss(tr) {
  const detail = tr.closest('.detail');
  for (const box of detail.querySelectorAll('.boss-stats')) box.hidden = box.dataset.boss !== tr.dataset.pick;
  for (const other of detail.querySelectorAll('tr.pick')) other.classList.toggle('picked', other === tr);
  loadFightStats(detail.querySelector(`.boss-stats[data-boss="${tr.dataset.pick}"]`));
}
$('runList').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr.pick');
  if (tr && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    pickBoss(tr);
  }
});

$('runList').addEventListener('click', (e) => {
  const tr = e.target.closest('tr.pick');
  if (tr) return pickBoss(tr);
  const button = e.target.closest('.run-row');
  if (!button) return;
  const li = button.parentElement;
  const isOpen = li.classList.toggle('open');
  button.setAttribute('aria-expanded', String(isOpen));
  li.querySelector('.detail').hidden = !isOpen;
  if (isOpen) {
    open.add(li.dataset.id);
    loadFightStats(li.querySelector('.detail'));
  }
  else open.delete(li.dataset.id);
});

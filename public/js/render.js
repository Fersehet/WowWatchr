// Baut die drei Seiten in den drei Layouts. Die Größen stehen auch im Editor, weil OBS sie braucht.
import { TEXTS } from './i18n.js';

export const SIZES = { a: [640, 270], c: [1060, 84], d: [300, 590] };
// Höchste Stufe in Retail (Midnight); darunter zeigt die Charakterseite die Stufe
const MAX_LEVEL = 90;
export const PAGES = ['character', 'mplus', 'raid'];
// Farbe und Deckkraft (%) des Hintergrunds, wenn im Editor nichts eingestellt ist
export const BACKGROUND = { a: ['#14161c', 94], c: ['#12141a', 74], d: ['#0f1116', 100] };

function background(settings) {
  const [color, opacity] = BACKGROUND[settings.layout];
  const [r, g, b] = (settings.bgColor ?? color).match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${(settings.opacity ?? opacity) / 100})`;
}

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MARK = (size) => `<img src="/logo.svg" alt="" width="${size}" height="${size}">`;
const AVATAR = (size, label, url) => url
  ? `<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}">`
  : `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 72 72" role="img" aria-label="${esc(label)}"><circle cx="36" cy="28" r="12" fill="#8b909c"/><path d="M12 66c2-16 12-23 24-23s22 7 24 23z" fill="#8b909c"/></svg>`;

/** Bereitet die Werte einmal auf, damit jedes Layout nur noch Markup enthält. */
// WoW Forever spielt nach den Regeln von 2004: kein Tempo, keine Meisterschaft, keine
// Vielseitigkeit. Dort zählen Krit, Ausweichen, Angriffs- bzw. Zaubermacht (je nach
// Hauptattribut) und Rüstung.
function classicStats(s, t, lang, pct) {
  const num = (n) => (n ?? 0).toLocaleString(lang).replace(/\s/g, ' ');
  const power = s.primary?.id === 'intellect' ? 'spellPower' : 'attackPower';
  return [
    { label: t.stat.crit, value: pct(s.crit ?? 0) },
    { label: t.classic.dodge, value: pct(s.dodge ?? 0) },
    { label: t.classic[power], value: num(s[power]) },
    { label: t.classic.armor, value: num(s.armor) },
  ];
}

function view(state, lang, game) {
  const t = TEXTS[lang];
  const pct = (n) => (lang === 'en' ? `${n}%` : `${n} %`);
  const { character: c, mplus: m, raid: r } = state;
  // WoW Forever: nur eine Schwierigkeit, ohne Namen
  const forever = game === 'forever';
  const diffs = forever ? r.difficulties.slice(0, 1) : r.difficulties;
  const top = [...diffs].reverse().find((d) => d.killed > 0);
  // WoW Forever hat kein Mythisch+: Seite heißt Dungeon, Wertung, Key und Zeitstufen fallen weg
  const mp = !forever;
  return {
    t,
    mp,
    title: mp ? t.mplus : t.dungeon,
    c: { name: esc(c.name), realm: esc(c.realm), guild: esc(c.guild), spec: esc(c.spec), hero: esc(c.hero ?? ''), level: c.level ?? 0, ilvl: c.ilvl, avatar: c.avatar },
    // Auf Max-Level sagt die Stufe nichts, dann zeigt die Seite sie nicht
    leveling: forever || !(c.level >= MAX_LEVEL),
    score: m.score.toLocaleString(lang).replace(/\s/g, ' '),
    // Wertung in Blizzards Farbe, sonst in der Akzentfarbe
    scoreStyle: /^#[0-9a-f]{6}$/i.test(m.color ?? '') ? `color:${m.color}` : '',
    scorePct: m.scorePct,
    best: `+${m.bestKey}`,
    timed: `${m.timed}/${m.total}`,
    // Fehlt die Statistik bei Blizzard, bleibt die Werte-Zeile leer
    stats: !state.stats ? [] : forever ? classicStats(state.stats, t, lang, pct) : Object.keys(t.stat).map((id) => ({ label: t.stat[id], value: pct(state.stats[id]) })),
    main: state.stats?.primary ? { label: t.main[state.stats.primary.id], value: state.stats.primary.value.toLocaleString(lang).replace(/\s/g, ' ') } : null,
    health: state.stats?.health ? new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: state.stats.health >= 1e5 && state.stats.health < 1e6 ? 0 : 1 }).format(state.stats.health).replace(/\s/g, ' ') : null,
    // Tertiärwerte nur, wenn wenigstens einer da ist (WoW Forever kennt keine)
    tert: !forever && state.stats && ['leech', 'avoidance', 'speed'].some((id) => state.stats[id] > 0)
      ? ['leech', 'avoidance', 'speed'].map((id) => ({ label: t.tert[id], value: pct((state.stats[id] ?? 0).toLocaleString(lang, { maximumFractionDigits: 1 })) }))
      : [],
    runs: m.runs.map((run) => ({
      key: `+${run.key}`,
      name: esc(run.name),
      time: run.time,
      result: run.result > 0 ? `+${run.result}` : `−${Math.abs(run.result)}`,
      cls: run.result > 0 ? 'up' : 'down',
    })),
    season: r.name ? esc(r.name) : r.season ? `${t.season} ${r.season}` : '',
    top: top ? `${top.killed}/${r.bosses}${forever ? '' : ` ${t.diffShort[top.id]}`}` : `0/${r.bosses}`,
    raids: diffs.map((d) => ({
      id: d.id,
      name: forever ? '' : t.diff[d.id],
      prog: `${d.killed}/${r.bosses}`,
      pct: r.bosses ? Math.round((d.killed / r.bosses) * 100) : 0,
      kills: d.kills,
      parse: d.parse,
      pips: Array.from({ length: r.bosses }, (_, n) => `<i class="${n < d.killed ? 'on' : ''}"></i>`).join(''),
    })),
  };
}

const each = (list, fn) => list.map(fn).join('');

const LAYOUTS = {
  a: {
    character: (v) => `
      <div class="row" style="gap:16px">
        ${AVATAR(72, v.t.portrait, v.c.avatar)}
        <div class="grow">
          <div style="font-size:30px;font-weight:700;line-height:1.1">${v.c.name}</div>
          <div class="sub">${v.c.spec}${v.c.hero ? `<span class="dot">·</span>${v.c.hero}` : ''}</div>
          <div class="sub2">${[v.c.realm, v.c.guild].filter(Boolean).join(' · ')}</div>
        </div>
        ${v.leveling ? `<div class="stack end" style="gap:4px"><div class="lbl">${v.t.level}</div><div style="font-size:38px;font-weight:700;line-height:1">${v.c.level}</div></div>` : ''}
        <div class="stack end" style="gap:4px"><div class="lbl">${v.t.ilvl}</div><div class="accent" style="font-size:38px;font-weight:700;line-height:1">${v.c.ilvl}</div></div>
      </div>
      <div class="sum">
        ${v.mp ? `<div><div class="lbl">${v.t.score}</div><div class="big accent" style="${v.scoreStyle}">${v.score}</div></div>` : ''}
        <div><div class="lbl">${v.t.raidShort}</div><div class="big">${v.top}</div></div>
        ${v.mp ? `<div><div class="lbl">${v.t.best}</div><div class="big">${v.best}</div></div>` : ''}
        ${v.main ? `<div><div class="lbl">${v.main.label}</div><div class="big">${v.main.value}</div></div>` : ''}
        ${v.health ? `<div><div class="lbl">${v.t.health}</div><div class="big">${v.health}</div></div>` : ''}
      </div>
      <div class="stats">${each(v.stats, (s) => `<div><div class="lbl">${s.label}</div><div class="num">${s.value}</div></div>`)}${each(v.tert, (s) => `<div class="t3"><div class="lbl">${s.label}</div><div class="num">${s.value}</div></div>`)}</div>`,
    mplus: (v) => `
      <div class="row between" style="margin-bottom:10px">
        <div class="stack" style="gap:2px">${v.mp ? `<div class="lbl">${v.t.recent}</div>` : ''}<div class="title">${v.title}</div></div>
        ${v.mp ? `<div class="row" style="gap:24px">
          <div class="stack end"><div class="lbl">${v.t.timed}</div><div class="num">${v.timed}</div></div>
          <div class="stack end"><div class="lbl">${v.t.best}</div><div class="num">${v.best}</div></div>
          <div class="stack end"><div class="lbl">${v.t.score}</div><div class="num accent" style="${v.scoreStyle}">${v.score}</div></div>
        </div>` : ''}
      </div>
      <div class="stack bottom" style="gap:6px">${v.runs.length ? each(v.runs, (r) => `
        <div class="row">${v.mp ? `<span class="chip">${r.key}</span>` : ''}<span class="grow name">${r.name}</span><span class="time">${r.time}</span>${v.mp ? `<span class="chip ${r.cls}">${r.result}</span>` : ''}</div>`) : `<div class="lbl">${v.t.noDungeons}</div>`}
      </div>`,
    raid: (v) => `
      <div class="row between">
        <div class="stack" style="gap:2px"><div class="lbl">${v.season}</div><div class="title">${v.t.raid}</div></div>
        <div class="stack end" style="gap:2px"><div class="lbl">${v.t.progress}</div><div class="title accent">${v.top}</div></div>
      </div>
      <div class="stack bottom" style="gap:16px">${each(v.raids, (r) => `
        <div class="q-${r.id}">
          <div class="row" style="margin-bottom:7px">
            <span class="grow dname" style="font-size:16px;font-weight:600">${r.name}</span>
            <span class="lbl">${v.t.kills}</span><span style="font-size:14px;font-weight:700;min-width:22px;text-align:right">${r.kills}</span>
            ${r.parse == null ? '' : `<span class="lbl" style="margin-left:8px">${v.t.parse}</span><span style="font-size:14px;font-weight:700;min-width:22px;text-align:right">${r.parse}</span>`}
            <span class="accent" style="font-size:16px;font-weight:700;margin-left:8px;min-width:30px;text-align:right">${r.prog}</span>
          </div>
          <div class="rp">${r.pips || '<i></i>'}</div>
        </div>`)}
      </div>`,
  },
  c: {
    character: (v) => `
      ${MARK(48)}
      <div class="stack who"><div style="font-size:20px;font-weight:700;line-height:1.15">${v.c.name}</div><div class="spec">${[v.leveling ? `${v.t.level} ${v.c.level}` : '', v.c.spec, v.c.hero].filter(Boolean).join(' · ')}</div></div>
      <div class="div"></div>
      <div class="stack"><div class="lbl">${v.t.ilvl}</div><div class="big accent">${v.c.ilvl}</div></div>
      ${v.mp ? `<div class="stack"><div class="lbl">${v.t.score}</div><div class="big accent" style="${v.scoreStyle}">${v.score}</div></div>` : ''}
      <div class="stack"><div class="lbl">${v.t.raidShort}</div><div class="big">${v.top}</div></div>
      ${v.main || v.health ? `<div class="div"></div>` : ''}
      ${v.main ? `<div class="stack"><div class="lbl">${v.main.label}</div><div class="big">${v.main.value}</div></div>` : ''}
      ${v.health ? `<div class="stack"><div class="lbl">${v.t.health}</div><div class="big">${v.health}</div></div>` : ''}
      ${v.stats.length ? `<div class="div"></div>` : ''}
      <div class="sec">${each(v.stats, (s) => `<div><span class="lbl">${s.label}</span><span>${s.value}</span></div>`)}</div>`,
    mplus: (v) => `
      ${MARK(48)}
      ${v.mp ? `<div class="stack" style="width:92px;flex:none"><div class="lbl">${v.t.score}</div><div class="big accent" style="${v.scoreStyle}">${v.score}</div></div>` : `<div class="big" style="flex:none">${v.title}</div>`}
      <div class="div"></div>
      <div class="row" style="gap:10px">${v.runs.length ? each(v.runs, (r) => `
        <div class="tile stack" style="gap:3px">
          <div class="row" style="gap:6px">${v.mp ? `<span style="font-size:17px;font-weight:700">${r.key}</span><span class="result ${r.cls}">${r.result}</span><span class="rtime ${r.cls}">${r.time}</span>` : `<span class="rtime">${r.time}</span>`}</div>
          <div class="name">${r.name}</div>
        </div>`) : `<div class="lbl">${v.t.noDungeons}</div>`}
      </div>`,
    raid: (v) => `
      ${MARK(48)}
      <div class="stack" style="min-width:110px"><div class="lbl">${v.t.progress}</div><div class="big accent">${v.top}</div></div>
      <div class="div"></div>
      ${each(v.raids, (r) => `
        <div class="stack grow q-${r.id}" style="gap:6px">
          <div class="row between"><span class="dname" style="font-size:14px;font-weight:600">${r.name}</span><span style="font-size:16px;font-weight:700">${r.prog}</span></div>
          <div class="pips">${r.pips}</div>
        </div>`)}`,
  },
  d: {
    character: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.t.character}</span></div>
      <div class="stack hero">
        ${AVATAR(56, v.t.portrait, v.c.avatar)}
        <div style="font-size:22px;font-weight:700;margin-top:8px;line-height:1.1">${v.c.name}</div>
        <div class="sub">${[v.leveling ? `${v.t.level} ${v.c.level}` : '', v.c.spec, v.c.hero].filter(Boolean).join(' · ')}</div>
        <div class="sub2">${[v.c.guild, v.c.realm].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="cells">
        <div><span class="lbl">${v.t.ilvl}</span><span class="big accent">${v.c.ilvl}</span></div>
        ${v.mp ? `<div><span class="lbl">${v.t.score}</span><span class="big accent" style="${v.scoreStyle}">${v.score}</span></div>` : ''}
        <div><span class="lbl">${v.t.raidShort}</span><span class="big">${v.top}</span></div>
        ${v.mp ? `<div><span class="lbl">${v.t.best}</span><span class="big">${v.best}</span></div>` : ''}
        ${v.main ? `<div><span class="lbl">${v.main.label}</span><span class="big">${v.main.value}</span></div>` : ''}
        ${v.health ? `<div><span class="lbl">${v.t.health}</span><span class="big">${v.health}</span></div>` : ''}
      </div>
      ${v.stats.length ? `<div class="cells small">${each(v.stats, (s) => `<div><span class="lbl">${s.label}</span><span class="num">${s.value}</span></div>`)}</div>` : ''}
      ${v.tert.length ? `<div class="tert">${each(v.tert, (s) => `<div><span class="lbl">${s.label}</span><span>${s.value}</span></div>`)}</div>` : ''}`,
    mplus: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.title}</span></div>
      ${v.mp ? `<div class="line"><span class="lbl">${v.t.score}</span><span class="accent" style="font-size:34px;font-weight:700;line-height:1;${v.scoreStyle}">${v.score}</span></div>
      <div class="line"><span class="lbl">${v.t.best}</span><span class="num">${v.best}</span></div>
      <div class="line"><span class="lbl">${v.t.timed}</span><span class="num">${v.timed}</span></div>` : ''}
      ${v.runs.length ? each(v.runs, (r) => `
        <div class="line">
          <div class="stack grow" style="gap:2px"><span style="font-size:14px;font-weight:400">${r.name}</span><span class="lbl">${r.time}</span></div>
          ${v.mp ? `<span class="num">${r.key}</span>
          <span class="chip ${r.cls}">${r.result}</span>` : ''}
        </div>`) : `<div class="line"><span class="lbl">${v.t.noDungeons}</span></div>`}`,
    raid: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.t.raid}</span></div>
      ${each(v.raids, (r) => `
        <div class="stack grow diff q-${r.id}">
          <div class="row between"><span class="dname">${r.name}</span><span style="font-size:36px;font-weight:700;line-height:1">${r.prog}</span></div>
          <div class="track"><div class="fill" style="width:${r.pct}%"></div></div>
          <div class="row between"><span class="lbl">${v.t.kills} <b>${r.kills}</b></span>${r.parse == null ? '' : `<span class="lbl">${v.t.parse} <b>${r.parse}</b></span>`}</div>
        </div>`)}`,
  },
};

export function renderPage(container, settings, state, page) {
  const inner = LAYOUTS[settings.layout][page](view(state, settings.lang, settings.game));
  container.innerHTML = `<div class="ov ${settings.layout}${settings.diffColors && settings.game !== 'forever' ? ' qc' : ''}" lang="${settings.lang}" style="--accent:${settings.accent};--card:${background(settings)}">${inner}</div>`;
}

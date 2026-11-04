// Baut die drei Seiten in den drei Layouts. Die Größen stehen auch im Editor, weil OBS sie braucht.
import { TEXTS } from './i18n.js';

export const SIZES = { a: [640, 270], c: [1060, 84], d: [300, 590] };
export const PAGES = ['character', 'mplus', 'raid'];

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MARK = (size) => `<img src="/logo.svg" alt="" width="${size}" height="${size}">`;
const AVATAR = (size, label) => `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 72 72" role="img" aria-label="${esc(label)}"><circle cx="36" cy="28" r="12" fill="#8b909c"/><path d="M12 66c2-16 12-23 24-23s22 7 24 23z" fill="#8b909c"/></svg>`;

/** Bereitet die Werte einmal auf, damit jedes Layout nur noch Markup enthält. */
function view(state, lang) {
  const t = TEXTS[lang];
  const pct = (n) => (lang === 'en' ? `${n}%` : `${n} %`);
  const { character: c, mplus: m, raid: r } = state;
  const top = [...r.difficulties].reverse().find((d) => d.killed > 0);
  return {
    t,
    c: { name: esc(c.name), realm: esc(c.realm), guild: esc(c.guild), spec: esc(c.spec), ilvl: c.ilvl },
    score: m.score.toLocaleString(lang).replace(/\s/g, ' '),
    scorePct: m.scorePct,
    best: `+${m.bestKey}`,
    timed: `${m.timed}/${m.total}`,
    stats: Object.keys(t.stat).map((id) => ({ label: t.stat[id], value: pct(state.stats[id]) })),
    runs: m.runs.map((run) => ({
      key: `+${run.key}`,
      name: esc(run.name),
      time: run.time,
      result: run.result > 0 ? `+${run.result}` : `−${Math.abs(run.result)}`,
      cls: run.result > 0 ? 'up' : 'down',
    })),
    season: `${t.season} ${r.season}`,
    top: top ? `${top.killed}/${r.bosses} ${t.diffShort[top.id]}` : `0/${r.bosses}`,
    raids: r.difficulties.map((d) => ({
      id: d.id,
      name: t.diff[d.id],
      prog: `${d.killed}/${r.bosses}`,
      pct: Math.round((d.killed / r.bosses) * 100),
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
        ${AVATAR(72, v.t.portrait)}
        <div class="grow">
          <div style="font-size:30px;font-weight:700;line-height:1.1">${v.c.name}</div>
          <div style="font-size:14px;color:#d3d7df;margin-top:4px">${v.c.spec} · ${v.c.realm}</div>
          <div style="font-size:13px;color:#b1b7c3;margin-top:2px">${v.c.guild}</div>
        </div>
        <div class="stack end" style="gap:4px"><div class="lbl">${v.t.ilvl}</div><div class="accent" style="font-size:38px;font-weight:700;line-height:1">${v.c.ilvl}</div></div>
      </div>
      <div style="margin-top:16px">
        <div class="row between" style="margin-bottom:6px"><span class="lbl">${v.t.score}</span><span style="font-size:15px;font-weight:700">${v.score}</span></div>
        <div class="track" style="height:10px"><div class="fill" style="width:${v.scorePct}%"></div></div>
      </div>
      <div class="stats">${each(v.stats, (s) => `<div><div class="lbl">${s.label}</div><div class="big">${s.value}</div></div>`)}</div>`,
    mplus: (v) => `
      <div class="row between" style="margin-bottom:10px">
        <div class="stack" style="gap:2px"><div class="lbl">${v.t.recent}</div><div class="title">${v.t.mplus}</div></div>
        <div class="row" style="gap:24px">
          <div class="stack end"><div class="lbl">${v.t.timed}</div><div class="num">${v.timed}</div></div>
          <div class="stack end"><div class="lbl">${v.t.best}</div><div class="num">${v.best}</div></div>
          <div class="stack end"><div class="lbl">${v.t.score}</div><div class="num accent">${v.score}</div></div>
        </div>
      </div>
      <div class="stack bottom" style="gap:6px">${each(v.runs, (r) => `
        <div class="row"><span class="chip">${r.key}</span><span class="grow name">${r.name}</span><span class="time">${r.time}</span><span class="chip ${r.cls}">${r.result}</span></div>`)}
      </div>`,
    raid: (v) => `
      <div class="row between">
        <div class="stack" style="gap:2px"><div class="lbl">${v.season}</div><div class="title">${v.t.raid}</div></div>
        <div class="stack end" style="gap:2px"><div class="lbl">${v.t.progress}</div><div class="title accent">${v.top}</div></div>
      </div>
      <div class="stack bottom" style="gap:14px">${each(v.raids, (r) => `
        <div>
          <div class="row" style="margin-bottom:6px">
            <span class="grow" style="font-size:15px;font-weight:600">${r.name}</span>
            <span class="lbl">${v.t.kills}</span><span style="font-size:14px;font-weight:700;min-width:22px;text-align:right">${r.kills}</span>
            <span class="lbl" style="margin-left:8px">${v.t.parse}</span><span style="font-size:14px;font-weight:700;min-width:22px;text-align:right">${r.parse}</span>
            <span class="accent" style="font-size:15px;font-weight:700;margin-left:8px;min-width:30px;text-align:right">${r.prog}</span>
          </div>
          <div class="track"><div class="fill" style="width:${r.pct}%"></div></div>
        </div>`)}
      </div>`,
  },
  c: {
    character: (v) => `
      ${MARK(48)}
      <div class="stack" style="min-width:150px"><div style="font-size:20px;font-weight:700;line-height:1.15">${v.c.name}</div><div style="font-size:12px;color:#d3d7df;white-space:nowrap">${v.c.spec}</div></div>
      <div class="div"></div>
      <div class="stack"><div class="lbl">${v.t.ilvl}</div><div class="big accent">${v.c.ilvl}</div></div>
      <div class="stack"><div class="lbl">${v.t.score}</div><div class="big accent">${v.score}</div></div>
      <div class="div"></div>
      ${each(v.stats, (s) => `<div class="stack grow"><div class="lbl">${s.label}</div><div style="font-size:20px;font-weight:700;line-height:1.2">${s.value}</div></div>`)}`,
    mplus: (v) => `
      ${MARK(48)}
      <div class="stack" style="width:92px;flex:none"><div class="lbl">${v.t.score}</div><div class="big accent">${v.score}</div></div>
      <div class="div"></div>
      <div class="row" style="gap:10px">${each(v.runs, (r) => `
        <div class="tile stack" style="gap:3px">
          <div class="row" style="gap:6px"><span style="font-size:17px;font-weight:700">${r.key}</span><span class="result ${r.cls}">${r.result}</span><span class="rtime ${r.cls}">${r.time}</span></div>
          <div class="name">${r.name}</div>
        </div>`)}
      </div>`,
    raid: (v) => `
      ${MARK(48)}
      <div class="stack" style="min-width:110px"><div class="lbl">${v.t.progress}</div><div class="big accent">${v.top}</div></div>
      <div class="div"></div>
      ${each(v.raids, (r) => `
        <div class="stack grow" style="gap:6px">
          <div class="row between"><span style="font-size:14px;font-weight:600">${r.name}</span><span style="font-size:16px;font-weight:700">${r.prog}</span></div>
          <div class="pips">${r.pips}</div>
        </div>`)}`,
  },
  d: {
    character: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.t.character}</span></div>
      <div class="stack hero">
        ${AVATAR(96, v.t.portrait)}
        <div style="font-size:26px;font-weight:700;margin-top:12px;line-height:1.1">${v.c.name}</div>
        <div style="font-size:14px;color:#d3d7df;margin-top:4px">${v.c.spec}</div>
        <div style="font-size:13px;color:#b1b7c3;margin-top:2px">${v.c.guild} · ${v.c.realm}</div>
      </div>
      <div class="line"><span class="lbl">${v.t.ilvl}</span><span class="big accent">${v.c.ilvl}</span></div>
      <div class="line"><span class="lbl">${v.t.score}</span><span class="big accent">${v.score}</span></div>
      ${each(v.stats, (s) => `<div class="line"><span class="lbl">${s.label}</span><span class="num">${s.value}</span></div>`)}`,
    mplus: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.t.mplus}</span></div>
      <div class="line"><span class="lbl">${v.t.score}</span><span class="accent" style="font-size:34px;font-weight:700;line-height:1">${v.score}</span></div>
      <div class="line"><span class="lbl">${v.t.best}</span><span class="num">${v.best}</span></div>
      <div class="line"><span class="lbl">${v.t.timed}</span><span class="num">${v.timed}</span></div>
      ${each(v.runs, (r) => `
        <div class="line">
          <div class="stack grow" style="gap:2px"><span style="font-size:14px;font-weight:500">${r.name}</span><span class="lbl">${r.time}</span></div>
          <span class="num">${r.key}</span>
          <span class="chip ${r.cls}">${r.result}</span>
        </div>`)}`,
    raid: (v) => `
      <div class="head">${MARK(28)}<span class="grow">${v.t.raid}</span></div>
      ${each(v.raids, (r) => `
        <div class="stack grow diff q-${r.id}">
          <div class="row between"><span class="dname">${r.name}</span><span style="font-size:36px;font-weight:700;line-height:1">${r.prog}</span></div>
          <div class="track"><div class="fill" style="width:${r.pct}%"></div></div>
          <div class="row between"><span class="lbl">${v.t.kills} <b>${r.kills}</b></span><span class="lbl">${v.t.parse} <b>${r.parse}</b></span></div>
        </div>`)}`,
  },
};

export function renderPage(container, settings, state, page) {
  const inner = LAYOUTS[settings.layout][page](view(state, settings.lang));
  container.innerHTML = `<div class="ov ${settings.layout}" lang="${settings.lang}" style="--accent:${settings.accent}">${inner}</div>`;
}

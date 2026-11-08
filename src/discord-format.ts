import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';
import type { Difficulty, Kill, Names, Run } from './history.ts';
import type { PlayerStats } from './logs.ts';
import type { Lang } from './settings.ts';

/**
 * Aussehen der Discord-Posts: „Tabelle“ als Text (Code-Block), „Kacheln“ als Bild oder „Mix“: Bild mit der ganzen Spielertabelle.
 * Ein Post pro neuem Bestwert im Dungeon oder pro Boss-Kill; mit Warcraft Logs kommen Spielerwerte dazu.
 */

export type Style = 'table' | 'tiles' | 'mix';

export type Event =
  | { kind: 'run'; run: Run; logged?: boolean } // logged = nicht von Blizzard, sondern aus Warcraft Logs (jeder Run, nicht nur Bestwerte)
  | { kind: 'kill'; kill: Kill; killed: number; total: number };

/** Was Warcraft Logs zu einem Run oder Kill weiß */
export interface LogInfo {
  tries: number | null; // nur bei Bossen
  fightMs: number;
  bestWipe: number | null; // Prozent, bei Bossen mit Wipes
  players: PlayerStats[];
}

export interface Look {
  lang: Lang;
  style: Style;
  accent: string;
  diffColors: boolean;
  who: string; // „Vaelric · Blackrock (EU)“
  logsEnabled: boolean;
}

export interface Post {
  payload: Record<string, unknown>;
  image: Buffer | null;
}

const API_LOCALES: Record<Lang, string> = { de: 'de_DE', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' };
const NUM_LOCALES: Record<Lang, string> = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU', fr: 'fr-FR' };
const DIFF_COLORS: Record<Difficulty, string> = { normal: '#5fd068', heroic: '#5aa9ff', mythic: '#c58bff' };
const RED = '#ff5a5a';

export const TEXTS: Record<Lang, Record<string, any>> = {
  de: {
    result: 'Ergebnis', interrupts: 'Unterbrechungen', newBest: 'Neuer Bestwert', run: 'Mythisch+-Run', timed: 'In der Zeit +{n}', overTime: 'Zeit überschritten', killed: '{boss} besiegt',
    time: 'Zeit', toSpare: 'Reserve', over: 'Drüber', runRating: 'Run-Wertung', affixes: 'Affixe', ilvl: 'Itemlevel', group: 'Gruppe',
    dps: 'DPS', hps: 'HPS', player: 'Spieler', dth: 'Tod', int: 'Unt', prs: 'Prs', tries: 'Versuche', fight: 'Kampf', bestWipe: 'Bester Wipe', progress: 'Fortschritt',
    topHps: 'Top-HPS', mostInt: 'Meiste Unterbrechungen', deaths: 'Tode', more: '{n} Spieler · die besten 5 hier, alle im Log',
    statsLater: 'Spielerwerte folgen, sobald das Warcraft-Logs-Log hochgeladen ist.', footer: 'WowWatchr · Blizzard-API', footerLogs: 'WowWatchr · Blizzard-API + Warcraft Logs',
    testTitle: 'Testpost von WowWatchr', testNote: 'WowWatchr ist mit diesem Kanal verbunden. So sehen deine Posts aus (Beispieldaten).',
    diff: { normal: 'Normal', heroic: 'Heroisch', mythic: 'Mythisch' },
  },
  en: {
    result: 'Result', interrupts: 'Interrupts', newBest: 'New best run', run: 'Mythic+ run', timed: 'Timed +{n}', overTime: 'Over time', killed: '{boss} killed',
    time: 'Time', toSpare: 'To spare', over: 'Over', runRating: 'Run rating', affixes: 'Affixes', ilvl: 'Item level', group: 'Group',
    dps: 'DPS', hps: 'HPS', player: 'Player', dth: 'Dth', int: 'Int', prs: 'Prs', tries: 'Tries', fight: 'Fight', bestWipe: 'Best wipe', progress: 'Progress',
    topHps: 'Top HPS', mostInt: 'Most interrupts', deaths: 'Deaths', more: '{n} players · top 5 shown, all in the log',
    statsLater: 'Player stats follow once the Warcraft Logs report is uploaded.', footer: 'WowWatchr · Blizzard API', footerLogs: 'WowWatchr · Blizzard API + Warcraft Logs',
    testTitle: 'WowWatchr test post', testNote: 'WowWatchr is connected to this channel. This is how your posts will look (sample data).',
    diff: { normal: 'Normal', heroic: 'Heroic', mythic: 'Mythic' },
  },
  ru: {
    result: 'Итог', interrupts: 'Прерывания', newBest: 'Новый рекорд', run: 'Забег М+', timed: 'В срок +{n}', overTime: 'Время вышло', killed: '{boss} побеждён',
    time: 'Время', toSpare: 'Запас', over: 'Сверх', runRating: 'Рейтинг забега', affixes: 'Модификаторы', ilvl: 'Ур. предметов', group: 'Группа',
    dps: 'УВС', hps: 'ИВС', player: 'Игрок', dth: 'Смр', int: 'Прр', prs: 'Прс', tries: 'Попытки', fight: 'Бой', bestWipe: 'Лучший вайп', progress: 'Прогресс',
    topHps: 'Лучший ИВС', mostInt: 'Больше всего прерываний', deaths: 'Смерти', more: '{n} игроков · здесь лучшие 5, все в логе',
    statsLater: 'Статистика игроков появится, когда лог Warcraft Logs будет загружен.', footer: 'WowWatchr · Blizzard API', footerLogs: 'WowWatchr · Blizzard API + Warcraft Logs',
    testTitle: 'Тестовый пост WowWatchr', testNote: 'WowWatchr подключён к этому каналу. Так будут выглядеть твои посты (пример).',
    diff: { normal: 'Обычный', heroic: 'Героический', mythic: 'Эпохальный' },
  },
  fr: {
    result: 'Résultat', interrupts: 'Interruptions', newBest: 'Nouveau record', run: 'Donjon M+', timed: 'Dans les temps +{n}', overTime: 'Temps dépassé', killed: '{boss} vaincu',
    time: 'Temps', toSpare: 'Avance', over: 'Retard', runRating: 'Score du donjon', affixes: 'Affixes', ilvl: "Niveau d'objet", group: 'Groupe',
    dps: 'DPS', hps: 'HPS', player: 'Joueur', dth: 'Mrt', int: 'Int', prs: 'Prs', tries: 'Essais', fight: 'Combat', bestWipe: 'Meilleur wipe', progress: 'Progression',
    topHps: 'Meilleur HPS', mostInt: "Plus d'interruptions", deaths: 'Morts', more: '{n} joueurs · les 5 meilleurs ici, tous dans le log',
    statsLater: 'Les stats des joueurs arrivent dès que le log Warcraft Logs est en ligne.', footer: 'WowWatchr · API Blizzard', footerLogs: 'WowWatchr · API Blizzard + Warcraft Logs',
    testTitle: 'Message de test WowWatchr', testNote: 'WowWatchr est connecté à ce salon. Voici à quoi ressembleront tes messages (exemple).',
    diff: { normal: 'Normal', heroic: 'Héroïque', mythic: 'Mythique' },
  },
};

export const pick = (names: Names, lang: Lang) => (typeof names === 'string' ? names : names?.[API_LOCALES[lang]] ?? names?.en_US ?? '');
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
const mmss = (ms: number) => {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const short = (n: number, lang: Lang) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString(NUM_LOCALES[lang], { maximumFractionDigits: 2 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

/** Alles, was beide Stile zeigen: Titel, Farbe, Kennzahlen, Spieler */
function facts(event: Event, log: LogInfo | null, look: Look) {
  const t = TEXTS[look.lang];
  if (event.kind === 'run') {
    const { run } = event;
    const timed = run.result > 0;
    const spare = run.limit - run.ms;
    // Runs aus Warcraft Logs kennen kein Zeitlimit und keine Wertung
    const limit = run.limit > 0;
    const rating = run.rating > 0 ? Math.round(run.rating).toLocaleString(NUM_LOCALES[look.lang]) : '–';
    const affixes = run.affixes.map((a) => pick(a, look.lang)).join(', ');
    return {
      color: timed ? look.accent : RED,
      title: `${event.logged ? t.run : t.newBest}: ${pick(run.dungeon, look.lang)} +${run.key}`,
      result: timed ? fill(t.timed, { n: run.result }) : t.overTime,
      tiles: event.logged ? [
        // Aus dem Log: statt Limit und Wertung (die kennt nur Blizzard) Ergebnis, Tode und Unterbrechungen der Gruppe
        { k: t.time, v: mmss(run.ms) },
        { k: t.result, v: timed ? `+${run.result}` : '–' },
        { k: t.deaths, v: log ? String(log.players.reduce((n, p) => n + p.deaths, 0)) : '–' },
        { k: t.interrupts, v: log ? String(log.players.reduce((n, p) => n + p.interrupts, 0)) : '–' },
      ] : [
        { k: t.time, v: mmss(run.ms) },
        { k: !limit || spare >= 0 ? t.toSpare : t.over, v: limit ? mmss(spare) : '–' },
        { k: t.runRating, v: rating },
        { k: t.affixes, v: affixes || '–' },
      ],
      line: [timed ? fill(t.timed, { n: run.result }) : t.overTime, limit ? `${mmss(run.ms)} / ${mmss(run.limit)}` : mmss(run.ms), run.rating > 0 ? `${t.runRating} ${rating}` : '', affixes].filter(Boolean).join(' · '),
      group: run.members.map((m) => ({ name: m.name, spec: pick(m.spec, look.lang), ilvl: m.ilvl })),
    };
  }
  const { kill } = event;
  const diff = t.diff[kill.difficulty];
  const tiles = [
    { k: t.tries, v: log?.tries != null ? String(log.tries) : '–' },
    { k: t.fight, v: log ? mmss(log.fightMs) : '–' },
    { k: t.bestWipe, v: log?.bestWipe != null ? `${log.bestWipe} %` : '–' },
    { k: t.progress, v: `${event.killed}/${event.total}` },
  ];
  const parts = [pick(kill.raid, look.lang), `${t.progress} ${event.killed}/${event.total} ${diff}`];
  if (log?.tries != null) parts.push(`${t.tries} ${log.tries}`, `${t.fight} ${mmss(log.fightMs)}`);
  if (log?.bestWipe != null) parts.push(`${t.bestWipe} ${log.bestWipe} %`);
  return {
    color: look.diffColors ? DIFF_COLORS[kill.difficulty] : look.accent,
    title: `${fill(t.killed, { boss: pick(kill.boss, look.lang) })} · ${diff}`,
    result: pick(kill.raid, look.lang),
    tiles,
    line: parts.join(' · '),
    group: [] as { name: string; spec: string; ilvl: number }[],
  };
}

/** Die besten 5 nach Schaden, der eigene Charakter immer dabei */
function top(players: PlayerStats[], me: string) {
  const list = players.slice(0, 5);
  const mine = players.find((p) => p.name === me);
  if (mine && !list.includes(mine)) list[4] = mine;
  return list;
}

function highlights(players: PlayerStats[], look: Look) {
  const t = TEXTS[look.lang];
  const healer = [...players].sort((a, b) => b.hps - a.hps)[0];
  const kicker = [...players].sort((a, b) => b.interrupts - a.interrupts)[0];
  const deaths = players.reduce((s, p) => s + p.deaths, 0);
  const out = [];
  if (healer?.hps) out.push({ k: t.topHps, v: `${healer.name} ${short(healer.hps, look.lang)}` });
  if (kicker?.interrupts) out.push({ k: t.mostInt, v: `${kicker.name} ${kicker.interrupts}` });
  out.push({ k: t.deaths, v: String(deaths) });
  return out;
}

const pad = (s: string, n: number, right = false) => {
  const cut = s.length > n ? `${s.slice(0, n - 1)}…` : s;
  return right ? cut.padStart(n) : cut.padEnd(n);
};

/** Tabelle: Discord-Karte mit der Spielertabelle als Code-Block */
function table(event: Event, log: LogInfo | null, look: Look, me: string): Post {
  const t = TEXTS[look.lang];
  const f = facts(event, log, look);
  const lines = [f.line];
  if (log?.players.length) {
    const rows = top(log.players, me).map((p) =>
      `${pad(p.name, 12)} ${pad(short(p.dps, look.lang), 6, true)} ${pad(short(p.hps, look.lang), 6, true)} ${pad(String(p.deaths), 3, true)} ${pad(String(p.interrupts), 3, true)} ${pad(p.parse == null ? '–' : String(p.parse), 3, true)}`);
    const head = `${pad(t.player, 12)} ${pad(t.dps, 6, true)} ${pad(t.hps, 6, true)} ${pad(t.dth, 3, true)} ${pad(t.int, 3, true)} ${pad(t.prs, 3, true)}`;
    lines.push('```', head, ...rows, '```');
    if (log.players.length > 5) lines.push(fill(t.more, { n: log.players.length }));
    lines.push(highlights(log.players, look).map((h) => `${h.k}: **${h.v}**`).join(' · '));
  } else if (f.group.length) {
    lines.push('```', ...f.group.map((m) => `${pad(m.name, 12)} ${pad(m.spec, 30)} ${pad(String(m.ilvl), 3, true)}`), '```');
  }
  if (!log && look.logsEnabled) lines.push(`*${t.statsLater}*`);
  return {
    payload: {
      embeds: [{
        color: parseInt(f.color.slice(1), 16),
        author: { name: look.who },
        title: f.title,
        description: lines.join('\n'),
        footer: { text: log ? t.footerLogs : t.footer },
        timestamp: new Date(event.kind === 'run' ? event.run.at : event.kill.at).toISOString(),
      }],
    },
    image: null,
  };
}

// ---------- Kacheln als Bild, im Look des Overlays ----------

const FONT_DIR = join(import.meta.dirname, '..', 'public', 'fonts');
const FONTS = ['Geist-Regular.ttf', 'Geist-SemiBold.ttf', 'Geist-Bold.ttf'].map((f) => join(FONT_DIR, f));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Grobe Breite für Geist, damit lange Namen nicht aus ihrer Kachel laufen
const fit = (s: string, size: number, width: number) => {
  const max = Math.floor(width / (size * 0.56));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Farben wie bei Warcraft Logs
const parseColor = (p: number | null) =>
  p == null ? '#8b90a0' : p >= 100 ? '#e5cc80' : p >= 99 ? '#e268a8' : p >= 95 ? '#ff8000' : p >= 75 ? '#a335ee' : p >= 50 ? '#0070ff' : p >= 25 ? '#1eff00' : '#9d9d9d';

export function tilesSvg(event: Event, log: LogInfo | null, look: Look, me: string) {
  const t = TEXTS[look.lang];
  const f = facts(event, log, look);
  const W = 800;
  const P = 32;
  const out: string[] = [];
  let y = P;
  const text = (x: number, yy: number, s: string, size: number, color: string, weight = 400, anchor = 'start') =>
    out.push(`<text x="${x}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`);

  text(P, y + 26, fit(f.title, 28, W - 2 * P), 28, '#ffffff', 700);
  text(P, y + 56, fit(`${look.who} · ${f.result}`, 16, W - 2 * P), 16, f.color, 600);
  y += 84;

  const gap = 12;
  const tw = (W - 2 * P - 3 * gap) / 4;
  f.tiles.forEach((tile, i) => {
    const x = P + i * (tw + gap);
    out.push(`<rect x="${x}" y="${y}" width="${tw}" height="78" rx="8" fill="#191c23"/>`);
    text(x + 14, y + 26, fit(tile.k.toUpperCase(), 12, tw - 28), 12, '#8b90a0', 600);
    text(x + 14, y + 60, fit(tile.v, tile.v.length > 8 ? 18 : 28, tw - 28), tile.v.length > 8 ? 18 : 28, i === 3 && event.kind === 'kill' ? f.color : '#ffffff', 700);
  });
  y += 78 + 28;

  if (log?.players.length && look.style === 'mix') {
    // Mix: Kachel-Look, aber alle Werte der Tabelle
    const list = top(log.players, me);
    const max = Math.max(1, ...list.map((p) => p.dps));
    const cols = [
      { k: t.dps, x: P + 380, v: (p: PlayerStats) => short(p.dps, look.lang) },
      { k: t.hps, x: P + 480, v: (p: PlayerStats) => short(p.hps, look.lang) },
      { k: t.dth, x: P + 560, v: (p: PlayerStats) => String(p.deaths) },
      { k: t.int, x: P + 640, v: (p: PlayerStats) => String(p.interrupts) },
      { k: t.prs, x: W - P, v: (p: PlayerStats) => (p.parse == null ? '–' : String(p.parse)) },
    ];
    text(P + 14, y + 14, t.player.toUpperCase(), 12, '#8b90a0', 600);
    for (const c of cols) text(c.x - 14, y + 14, c.k.toUpperCase(), 12, '#8b90a0', 600, 'end');
    y += 26;
    list.forEach((p, i) => {
      const mine = p.name === me;
      if (i % 2 === 0) out.push(`<rect x="${P}" y="${y}" width="${W - 2 * P}" height="40" rx="6" fill="#151820"/>`);
      // Schmaler Balken unten: Anteil am Schaden des Besten
      out.push(`<rect x="${P + 14}" y="${y + 33}" width="${Math.max(4, Math.round((250 * p.dps) / max))}" height="3" rx="1.5" fill="${mine ? f.color : '#4e5058'}"/>`);
      text(P + 14, y + 25, fit(p.name, 16, 220), 16, mine ? f.color : '#e6e6ea', 600);
      for (const c of cols) {
        const value = c.v(p);
        const color = c.k === t.prs ? parseColor(p.parse) : c.k === t.dth && p.deaths ? RED : '#ffffff';
        text(c.x - 14, y + 25, value, 16, color, 700, 'end');
      }
      y += 40;
    });
    y += 10;
    if (log.players.length > 5) {
      text(P, y + 12, fill(t.more, { n: log.players.length }), 13, '#8b90a0');
      y += 26;
    }
    let x = P;
    for (const h of highlights(log.players, look)) {
      const label = `${h.k}: ${h.v}`;
      const w = Math.min(W - P - x, label.length * 8 + 28);
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="#191c23"/>`);
      text(x + 14, y + 20, fit(label, 14, w - 28), 14, '#e6e6ea', 600);
      x += w + 10;
    }
    y += 30 + 24;
  } else if (log?.players.length) {
    const list = top(log.players, me);
    const max = Math.max(1, ...list.map((p) => p.dps));
    for (const p of list) {
      const mine = p.name === me;
      const bx = P + 150;
      const bw = W - 2 * P - 150 - 80;
      text(P, y + 15, fit(p.name, 16, 140), 16, mine ? f.color : '#e6e6ea', 600);
      out.push(`<rect x="${bx}" y="${y}" width="${bw}" height="18" rx="4" fill="#191c23"/>`);
      out.push(`<rect x="${bx}" y="${y}" width="${Math.max(4, Math.round((bw * p.dps) / max))}" height="18" rx="4" fill="${mine ? f.color : '#4e5058'}"/>`);
      text(W - P, y + 15, short(p.dps, look.lang), 16, '#ffffff', 700, 'end');
      y += 30;
    }
    y += 8;
    let x = P;
    for (const h of highlights(log.players, look)) {
      const label = `${h.k}: ${h.v}`;
      const w = Math.min(W - P - x, label.length * 8 + 28);
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="#191c23"/>`);
      text(x + 14, y + 20, fit(label, 14, w - 28), 14, '#e6e6ea', 600);
      x += w + 10;
    }
    y += 30 + 24;
  } else if (f.group.length) {
    for (const m of f.group) {
      text(P, y + 15, fit(m.name, 16, 200), 16, m.name === me ? f.color : '#e6e6ea', 600);
      text(P + 210, y + 15, fit(m.spec, 15, W - 2 * P - 290), 15, '#8b90a0');
      text(W - P, y + 15, String(m.ilvl), 15, '#e6e6ea', 600, 'end');
      y += 28;
    }
    y += 12;
  }
  if (!log && look.logsEnabled) {
    text(P, y + 12, fit(t.statsLater, 14, W - 2 * P), 14, '#8b90a0');
    y += 34;
  }
  const H = y + P - 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist">
<rect width="${W}" height="${H}" rx="12" fill="#0f1116"/><rect x="${P}" width="64" height="3" fill="${f.color}"/>
${out.join('\n')}
</svg>`;
}

function tiles(event: Event, log: LogInfo | null, look: Look, me: string): Post {
  const t = TEXTS[look.lang];
  const f = facts(event, log, look);
  const svg = tilesSvg(event, log, look, me);
  const image = Buffer.from(new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Geist' }, fitTo: { mode: 'width', value: 1600 } }).render().asPng());
  return {
    payload: {
      embeds: [{
        color: parseInt(f.color.slice(1), 16),
        author: { name: look.who },
        title: f.title,
        image: { url: 'attachment://wowwatchr.png' },
        footer: { text: log ? t.footerLogs : t.footer },
        timestamp: new Date(event.kind === 'run' ? event.run.at : event.kill.at).toISOString(),
      }],
    },
    image,
  };
}

/** Baut den Post im gewählten Stil. `me` = Name des eigenen Charakters (wird hervorgehoben). */
export function buildPost(event: Event, log: LogInfo | null, look: Look, me: string): Post {
  return look.style === 'table' ? table(event, log, look, me) : tiles(event, log, look, me);
}

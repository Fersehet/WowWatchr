import type { Lang, Settings } from './settings.ts';

const NAMES: Record<Lang, { spec: string; hero: string; dungeons: string[] }> = {
  de: { spec: 'Frost-Magier', hero: 'Frostfeuer', dungeons: ['Terrasse der Magister', 'Himmelsnadel', "Akademie von Algeth'ar", 'Grube von Saron', 'Sitz des Triumvirats'] },
  en: { spec: 'Frost Mage', hero: 'Frostfire', dungeons: ["Magisters' Terrace", 'Skyreach', "Algeth'ar Academy", 'Pit of Saron', 'Seat of the Triumvirate'] },
  ru: { spec: 'Маг «Лёд»', hero: 'Ледяной огонь', dungeons: ['Терраса Магистров', 'Небесный Путь', "Академия Алгет'ар", 'Яма Сарона', 'Престол Триумвирата'] },
  fr: { spec: 'Mage Givre', hero: 'Feu de givre', dungeons: ['Terrasse des Magistères', 'Orée-du-Ciel', "Académie d'Algeth'ar", 'Fosse de Saron', 'Siège du Triumvirat'] },
};

const RUNS = [
  { key: 14, time: '27:48', result: 2 },
  { key: 13, time: '25:12', result: 1 },
  { key: 14, time: '36:41', result: -1 },
  { key: 12, time: '24:03', result: 3 },
  { key: 13, time: '31:22', result: 1 },
];

/** Beispieldaten im selben Aufbau, den später die echten Daten liefern. */
export function demoState(settings: Settings) {
  const names = NAMES[settings.lang];
  return {
    demo: true,
    character: { name: settings.name, realm: settings.realm, guild: 'Silent Vigil', spec: names.spec, level: 90, ilvl: 284, avatar: '/img/sample-portrait.svg', hero: names.hero },
    stats: { crit: 24, haste: 31, mastery: 46, versatility: 8, dodge: 5, attackPower: 1_512, spellPower: 1_240, armor: 2_310, primary: { id: 'intellect', value: 18_642 }, health: 512_400, leech: 3.2, avoidance: 1.6, speed: 4.1 },
    mplus: {
      score: 2847,
      color: '#a335ee',
      scorePct: 69,
      bestKey: 14,
      timed: 7,
      total: 8,
      runs: RUNS.map((run, i) => ({ ...run, name: names.dungeons[i] })),
    },
    raid: {
      season: 1,
      bosses: 9,
      difficulties: [
        { id: 'normal', killed: 9, kills: 27, parse: 88 },
        { id: 'heroic', killed: 9, kills: 45, parse: 94 },
        { id: 'mythic', killed: 4, kills: 8, parse: 71 },
      ],
    },
  };
}

// Beispiel-Verlauf für die Statistik-Seite, Namen in allen Sprachen wie bei Blizzard
const loc = (de: string, en: string, ru: string, fr: string) => ({ de_DE: de, en_US: en, ru_RU: ru, fr_FR: fr });
const dungeon = (i: number) => loc(NAMES.de.dungeons[i], NAMES.en.dungeons[i], NAMES.ru.dungeons[i], NAMES.fr.dungeons[i]);
const AFFIXES = [loc('Verstärkt', 'Fortified', 'Укрепленный', 'Fortifié'), loc('Tyrannisch', 'Tyrannical', 'Тиранический', 'Tyrannique')];
const PARTY = [
  ['Vaelric', loc('Frost-Magier', 'Frost Mage', 'Маг «Лёд»', 'Mage Givre'), 284],
  ['Brannox', loc('Schutz-Krieger', 'Protection Warrior', 'Воин «Защита»', 'Guerrier Protection'), 286],
  ['Lyssia', loc('Heilig-Priester', 'Holy Priest', 'Жрец «Свет»', 'Prêtre Sacré'), 283],
  ['Kortha', loc('Verwüstung-Dämonenjäger', 'Havoc Demon Hunter', 'Охотник на демонов «Истребление»', 'Chasseur de démons Dévastation'), 285],
  ['Elowyn', loc('Wiederherstellung-Druide', 'Restoration Druid', 'Друид «Исцеление»', 'Druide Restauration'), 282],
] as const;
const LIMITS = [1_980_000, 1_680_000, 1_920_000, 2_100_000, 2_040_000];
const DAY = 86_400_000;
const RAID_NAME = loc('Beispielraid', 'Sample raid', 'Пример рейда', "Raid d'exemple");
const boss = (n: number) => loc(`Boss ${n}`, `Boss ${n}`, `Босс ${n}`, `Boss ${n}`);

export const DEMO_CODE = 'DemoReport000001';

/** Beispielwerte pro Spieler wie aus Warcraft Logs */
export function demoFight(fight: number) {
  return PARTY.map(([name], i) => ({
    name,
    dps: [512_400, 198_300, 61_200, 488_900, 54_700][i] - fight * 1_000,
    hps: [8_100, 21_400, 402_600, 6_300, 377_800][i],
    deaths: i === 3 && fight % 2 ? 1 : 0,
    interrupts: [4, 7, 0, 5, 1][i],
    parse: [93, 71, 64, 88, 79][i],
  })).sort((a, b) => b.dps - a.dps);
}

export function demoHistory() {
  const now = Date.now();
  // 20 Uhr vor ein paar Tagen, damit ein Raid-Abend nicht über Mitternacht geht
  const evening = (days: number) => new Date(now - days * DAY).setHours(20, 0, 0, 0);
  const ms = (time: string) => time.split(':').reduce((m, part) => m * 60 + Number(part), 0) * 1000;
  return {
    demo: true,
    runs: RUNS.map((run, i) => ({
      at: now - (i * 1.5 + 0.5) * DAY,
      season: 1,
      dungeonId: i + 1,
      dungeon: dungeon(i),
      key: run.key,
      ms: ms(run.time),
      limit: LIMITS[i],
      result: run.result,
      rating: 300 - i * 6.5 - (run.result < 0 ? 25 : 0),
      affixes: [AFFIXES[i % 2]],
      members: PARTY.map(([name, spec, ilvl]) => ({ name, realm: 'Blackrock', spec, ilvl: ilvl - i })),
    })),
    // Zwei Raid-Abende: Bosse, die zwischen zwei Abfragen gefallen sind
    kills: [
      ...[1, 2, 3].map((i) => ({ at: evening(1) + i * 1_800_000, raid: RAID_NAME, boss: boss(i), difficulty: 'mythic', count: 1 })),
      ...[4, 5].map((i) => ({ at: evening(3) + i * 1_800_000, raid: RAID_NAME, boss: boss(i), difficulty: 'heroic', count: 1 })),
    ],
    // Warcraft Logs: ein Raid-Abend mit Versuchen und ein Dungeon
    logs: { status: 'demo', reports: [
      {
        code: DEMO_CODE, title: 'Raid', start: evening(1), end: evening(1) + 9_000_000, zone: RAID_NAME,
        fights: [
          [1, 1, 300_000, 420_000, false, 34.5], [2, 1, 600_000, 900_000, true, 0], [3, 2, 1_200_000, 1_470_000, true, 0],
          ...[0, 1, 2, 3, 4].map((n) => [4 + n, 3, 1_800_000 + n * 600_000, 2_100_000 + n * 600_000, false, 62 - n * 11]),
          [9, 3, 4_800_000, 5_190_000, true, 0],
        ].map(([id, b, start, end, kill, percent]) => ({
          id, name: boss(Number(b)), encounterId: b, start, end, kill, difficulty: 5, percent, keyLevel: null, keyTime: null, keyBonus: null,
        })),
      },
      {
        code: DEMO_CODE, title: 'M+', start: now - 0.5 * DAY - 1_800_000, end: now - 0.5 * DAY, zone: dungeon(0),
        fights: [{ id: 20, name: dungeon(0), encounterId: 1, start: 60_000, end: 1_800_000, kill: true, difficulty: 10, percent: 0, keyLevel: 14, keyTime: ms(RUNS[0].time), keyBonus: 2 }],
      },
    ] },
    raids: [{
      id: 1,
      name: RAID_NAME,
      bosses: [9, 9, 9, 4, 4, 2].map((last, i) => ({
        id: i + 1,
        name: boss(i + 1),
        kills: { normal: 3, heroic: 5 - Math.floor(i / 2), mythic: i < 4 ? 2 : 0 },
        last: { normal: now - (last + 3) * 0.4 * DAY, heroic: now - last * 0.4 * DAY, mythic: i < 4 ? now - last * 0.4 * DAY : 0 },
      })),
    }],
  };
}

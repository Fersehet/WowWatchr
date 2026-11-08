import type { Lang, Settings } from './settings.ts';

const NAMES: Record<Lang, { spec: string; dungeons: string[] }> = {
  de: { spec: 'Frost-Magier', dungeons: ['Terrasse der Magister', 'Himmelsnadel', "Akademie von Algeth'ar", 'Grube von Saron', 'Sitz des Triumvirats'] },
  en: { spec: 'Frost Mage', dungeons: ["Magisters' Terrace", 'Skyreach', "Algeth'ar Academy", 'Pit of Saron', 'Seat of the Triumvirate'] },
  ru: { spec: 'Маг «Лёд»', dungeons: ['Терраса Магистров', 'Небесный Путь', "Академия Алгет'ар", 'Яма Сарона', 'Престол Триумвирата'] },
  fr: { spec: 'Mage Givre', dungeons: ['Terrasse des Magistères', 'Orée-du-Ciel', "Académie d'Algeth'ar", 'Fosse de Saron', 'Siège du Triumvirat'] },
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
    character: { name: settings.name, realm: settings.realm, guild: 'Silent Vigil', spec: names.spec, ilvl: 284 },
    stats: { crit: 24, haste: 31, mastery: 46, versatility: 8 },
    mplus: {
      score: 2847,
      scorePct: 69,
      bestKey: 14,
      timed: 38,
      total: 44,
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

export function demoHistory() {
  const now = Date.now();
  // 20 Uhr vor ein paar Tagen, damit ein Raid-Abend nicht über Mitternacht geht
  const evening = (days: number) => new Date(now - days * DAY).setHours(20, 0, 0, 0);
  const ms = (time: string) => time.split(':').reduce((m, part) => m * 60 + Number(part), 0) * 1000;
  return {
    demo: true,
    runs: RUNS.map((run, i) => ({
      at: now - (i * 1.5 + 0.5) * DAY,
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
    raids: [{
      id: 1,
      name: RAID_NAME,
      bosses: [9, 9, 9, 4, 4, 2].map((last, i) => ({
        id: i + 1,
        name: boss(i + 1),
        kills: { normal: 3, heroic: 5 - Math.floor(i / 2), mythic: i < 4 ? 2 : 0 },
        last: now - last * 0.4 * DAY,
      })),
    }],
  };
}

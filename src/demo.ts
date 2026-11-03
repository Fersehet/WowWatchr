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

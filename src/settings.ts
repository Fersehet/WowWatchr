import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LANGS = ['de', 'en', 'ru', 'fr'] as const;
export type Lang = (typeof LANGS)[number];

const LAYOUTS = ['a', 'c', 'd'] as const;
export const REGIONS = ['eu', 'us', 'kr', 'tw'] as const;
export type Region = (typeof REGIONS)[number];
export const GAMES = ['retail', 'forever'] as const;
export const DISCORD_STYLES = ['table', 'tiles', 'mix'] as const;

export interface Settings {
  layout: (typeof LAYOUTS)[number];
  name: string;
  realm: string; // bei Forever der Nachname, dort gibt es keine Realms
  region: Region;
  game: (typeof GAMES)[number];
  pages: { character: boolean; mplus: boolean; raid: boolean };
  interval: number;
  scale: number; // Größe des Overlays in Prozent, z. B. 133 für 1440p
  opacity: number | null; // Deckkraft des Hintergrunds in Prozent, null = Standard des Layouts
  bgColor: string | null; // Farbe des Hintergrunds, null = Standard des Layouts
  lang: Lang;
  accent: string;
  diffColors: boolean; // Schwierigkeiten in Grün/Blau/Lila statt in der Akzentfarbe
  discordStyle: (typeof DISCORD_STYLES)[number]; // Tabelle als Text, Kacheln als Bild oder Mix (Bild mit Tabelle)
  discordLang: Lang; // Discord kann nicht übersetzen, also eine Sprache für den Kanal
}

export const DEFAULTS: Settings = {
  layout: 'a',
  name: 'Vaelric',
  realm: 'Blackrock',
  region: 'eu',
  game: 'retail',
  pages: { character: true, mplus: true, raid: true },
  interval: 10,
  scale: 100,
  opacity: null,
  bgColor: null,
  lang: 'en',
  accent: '#ffd100',
  diffColors: true,
  discordStyle: 'table',
  discordLang: 'en',
};

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim().slice(0, 40) : fallback;
}

/** Macht aus beliebigem JSON gültige Einstellungen. Unbekanntes fällt auf den Standard zurück. */
export function sanitize(input: unknown): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const pages = {
    character: raw.pages?.character !== false,
    mplus: raw.pages?.mplus !== false,
    raid: raw.pages?.raid !== false,
  };
  // Der Wechsel-Link braucht mindestens eine Seite
  if (!pages.character && !pages.mplus && !pages.raid) pages.character = true;
  const interval = Number(raw.interval);
  const scale = Number(raw.scale);
  const opacity = raw.opacity === null || raw.opacity === undefined || raw.opacity === '' ? NaN : Number(raw.opacity);
  return {
    layout: LAYOUTS.includes(raw.layout) ? raw.layout : DEFAULTS.layout,
    name: text(raw.name, DEFAULTS.name),
    realm: text(raw.realm, DEFAULTS.realm),
    region: REGIONS.includes(raw.region) ? raw.region : DEFAULTS.region,
    game: GAMES.includes(raw.game) ? raw.game : DEFAULTS.game,
    pages,
    interval: Number.isFinite(interval) ? Math.min(120, Math.max(3, Math.round(interval))) : DEFAULTS.interval,
    scale: Number.isFinite(scale) ? Math.min(300, Math.max(50, Math.round(scale))) : DEFAULTS.scale,
    opacity: Number.isFinite(opacity) ? Math.min(100, Math.max(0, Math.round(opacity))) : DEFAULTS.opacity,
    bgColor: typeof raw.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.bgColor) ? raw.bgColor : DEFAULTS.bgColor,
    lang: LANGS.includes(raw.lang) ? raw.lang : DEFAULTS.lang,
    accent: typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : DEFAULTS.accent,
    diffColors: raw.diffColors !== false,
    discordStyle: DISCORD_STYLES.includes(raw.discordStyle) ? raw.discordStyle : DEFAULTS.discordStyle,
    discordLang: LANGS.includes(raw.discordLang) ? raw.discordLang : DEFAULTS.discordLang,
  };
}

export function loadSettings(file: string): Settings {
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(file: string, settings: Settings): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2));
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LANGS = ['de', 'en', 'ru', 'fr'] as const;
export type Lang = (typeof LANGS)[number];

const LAYOUTS = ['a', 'c', 'd'] as const;

export interface Settings {
  layout: (typeof LAYOUTS)[number];
  name: string;
  realm: string;
  pages: { character: boolean; mplus: boolean; raid: boolean };
  interval: number;
  lang: Lang;
  accent: string;
}

export const DEFAULTS: Settings = {
  layout: 'a',
  name: 'Vaelric',
  realm: 'Blackrock',
  pages: { character: true, mplus: true, raid: true },
  interval: 10,
  lang: 'en',
  accent: '#ffd100',
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
  return {
    layout: LAYOUTS.includes(raw.layout) ? raw.layout : DEFAULTS.layout,
    name: text(raw.name, DEFAULTS.name),
    realm: text(raw.realm, DEFAULTS.realm),
    pages,
    interval: Number.isFinite(interval) ? Math.min(120, Math.max(3, Math.round(interval))) : DEFAULTS.interval,
    lang: LANGS.includes(raw.lang) ? raw.lang : DEFAULTS.lang,
    accent: typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : DEFAULTS.accent,
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

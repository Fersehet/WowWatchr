import type { Raid, Run, Snapshot } from './history.ts';
import type { Lang, Region, Settings } from './settings.ts';

/**
 * Echte Daten nur über die Blizzard-API (eigener Schlüssel in der .env).
 * Blizzard aktualisiert einen Charakter, wenn er sich ausloggt.
 */

export type Status = 'loading' | 'live' | 'notFound' | 'offline';
type Json = Record<string, any>;
type Fetch = typeof fetch;

const LOCALES: Record<Lang, string> = { de: 'de_DE', en: 'en_US', ru: 'ru_RU', fr: 'fr_FR' };
// Jede Saison seit Dragonflight hat acht Dungeons
const SEASON_DUNGEONS = 8;
// Spezialisierung und Klasse in der Reihenfolge der Sprache
const SPEC: Record<Lang, (spec: string, cls: string) => string> = {
  de: (s, c) => `${s}-${c}`, en: (s, c) => `${s} ${c}`, fr: (s, c) => `${c} ${s}`, ru: (s, c) => `${c} «${s}»`,
};
// Grobe Skala für den Balken: 4000 Wertung = voll
const SCORE_FULL = 4000;

export const slug = (text: string) =>
  text.trim().toLowerCase().replace(/['’]/g, '').replace(/[\s_]+/g, '-');

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function getJson(fetchFn: Fetch, url: string, init: RequestInit = {}): Promise<Json | null> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(10_000) });
  // 404: Charakter unbekannt oder (noch) keine Daten, z. B. keine Keys in dieser Saison
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<Json>;
}

export class Blizzard {
  private token = '';
  private tokenUntil = 0;
  private cache = new Map<string, Json | null>();

  constructor(private id: string, private secret: string, private fetchFn: Fetch = fetch) {}

  get enabled() {
    return Boolean(this.id && this.secret);
  }

  private async auth() {
    if (Date.now() < this.tokenUntil) return this.token;
    const res = await this.fetchFn('https://oauth.battle.net/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.id}:${this.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Blizzard-Schlüssel abgelehnt (${res.status})`);
    const data = (await res.json()) as Json;
    this.token = data.access_token;
    this.tokenUntil = Date.now() + (data.expires_in - 60) * 1000;
    return this.token;
  }

  /** Ohne locale liefert Blizzard jeden Namen in allen Sprachen. */
  async get(region: Region, path: string, namespace: string) {
    const url = `https://${region}.api.blizzard.com${path}?namespace=${namespace}-${region}`;
    return getJson(this.fetchFn, url, { headers: { Authorization: `Bearer ${await this.auth()}` } });
  }

  /** Für Daten, die sich nur mit Patches ändern (Realms, Dungeons). */
  async cached(region: Region, path: string, namespace = 'dynamic') {
    const key = `${namespace}-${region}${path}`;
    if (!this.cache.has(key)) this.cache.set(key, await this.get(region, path, namespace));
    return this.cache.get(key) ?? null;
  }
}

export async function fetchLive(settings: Settings, blizzard: Blizzard) {
  const { region, lang } = settings;
  const locale = LOCALES[lang];
  const tr = (names: Json | string | undefined) => (typeof names === 'string' ? names : names?.[locale] ?? names?.en_US ?? '');

  // WoW Forever: eigene Namespaces (profile-forever-eu …), keine Realms, Charakter = Name-Nachname.
  // Blizzard hat das noch nicht dokumentiert, Stand Nov. 2026 von Spielern ausprobiert.
  const forever = settings.game === 'forever';
  const ns = (kind: string) => (forever ? `${kind}-forever` : kind);
  const name = settings.name.trim().toLowerCase();
  const wanted = settings.realm.trim().toLowerCase();
  let path: string;
  let realmSlug = slug(wanted);
  if (forever) {
    path = `/profile/wow/character/${encodeURIComponent(`${name}-${slug(wanted)}`)}`;
  } else {
    // Realm in jeder Sprache (z. B. „Гордунни“) oder als Slug
    const realms = await blizzard.cached(region, '/data/wow/realm/index');
    const realm = realms?.realms?.find((r: Json) => r.slug === slug(wanted) || Object.values(r.name ?? {}).some((n) => String(n).toLowerCase() === wanted))?.slug ?? slug(wanted);
    path = `/profile/wow/character/${realm}/${encodeURIComponent(name)}`;
    realmSlug = realm;
  }
  const profile = await blizzard.get(region, path, ns('profile'));
  if (!profile) return null;

  const seasons = await blizzard.get(region, '/data/wow/mythic-keystone/season/index', ns('dynamic'));
  const [stats, media, raids, season] = await Promise.all([
    blizzard.get(region, `${path}/statistics`, ns('profile')),
    blizzard.get(region, `${path}/character-media`, ns('profile')),
    blizzard.get(region, `${path}/encounters/raids`, ns('profile')),
    seasons?.current_season ? blizzard.get(region, `${path}/mythic-keystone-profile/season/${seasons.current_season.id}`, ns('profile')) : null,
  ]);

  // Pro Dungeon der beste Run der Saison, neueste zuerst
  const best: Json[] = (season?.best_runs ?? []).toSorted((a: Json, b: Json) => b.completed_timestamp - a.completed_timestamp);
  const timed = best.filter((run) => run.is_completed_within_time);
  // Stufen (+1 bis +3) stehen nur in den Dungeon-Daten: Zeitgrenzen pro Stufe
  const dungeonData = (run: Json) => blizzard.cached(region, `/data/wow/mythic-keystone/dungeon/${run.dungeon.id}`, ns('dynamic'));
  const upgrades = async (run: Json) => {
    if (!run.is_completed_within_time) return -1;
    const steps = ((await dungeonData(run))?.keystone_upgrades ?? []).filter((u: Json) => run.duration <= u.qualifying_duration).length;
    return Math.max(1, steps);
  };

  // Aktueller Raid: der aus der neuesten Erweiterung, in dem zuletzt ein Boss fiel
  const lastKill = (instance: Json) =>
    Math.max(0, ...(instance.modes ?? []).flatMap((m: Json) => m.progress?.encounters ?? []).map((e: Json) => e.last_kill_timestamp ?? 0));
  const newest = raids?.expansions?.at(-1)?.instances ?? [];
  const instance: Json | undefined = newest.toSorted((a: Json, b: Json) => lastKill(b) - lastKill(a))[0];
  const mode = (type: string) => instance?.modes?.find((m: Json) => m.difficulty?.type === type)?.progress;

  const pct = (...values: unknown[]) => Math.round(Math.max(...values.map((v) => Number(v) || 0)));
  const spec = SPEC[lang];
  const score = Math.round(season?.mythic_rating?.rating ?? 0);

  // Für die Statistik-Seite: alle Namen in allen Sprachen, gespeichert wird auf dem Server (history.ts)
  const specName = async (spec: Json | undefined) => {
    if (!spec?.id) return '';
    const data = await blizzard.cached(region, `/data/wow/playable-specialization/${spec.id}`, ns('static'));
    const cls = data?.playable_class?.name;
    if (!cls || typeof spec.name !== 'object') return spec.name ?? '';
    return Object.fromEntries(Object.entries(LOCALES).map(([l, loc]) => [loc, SPEC[l as Lang](spec.name[loc] ?? spec.name.en_US, cls[loc] ?? cls.en_US)]));
  };
  const snapshot: Snapshot = {
    runs: await Promise.all(best.map(async (run): Promise<Run> => ({
      at: run.completed_timestamp,
      season: seasons?.current_season?.id ?? 0,
      dungeonId: run.dungeon.id,
      dungeon: run.dungeon.name ?? '',
      key: run.keystone_level,
      ms: run.duration,
      limit: (await dungeonData(run))?.keystone_upgrades?.find((u: Json) => u.upgrade_level === 1)?.qualifying_duration ?? 0,
      result: await upgrades(run),
      rating: Math.round((run.mythic_rating?.rating ?? 0) * 10) / 10,
      affixes: (run.keystone_affixes ?? []).map((a: Json) => a.name ?? ''),
      members: await Promise.all((run.members ?? []).map(async (m: Json) => ({
        name: m.character?.name ?? '',
        realm: (forever ? null : (await blizzard.cached(region, '/data/wow/realm/index'))?.realms?.find((r: Json) => r.slug === m.character?.realm?.slug)?.name) ?? m.character?.realm?.slug ?? '',
        spec: await specName(m.specialization),
        ilvl: m.equipped_item_level ?? 0,
      }))),
    }))),
    raids: newest.map((inst: Json): Raid => {
      const bosses = new Map<number, Raid['bosses'][number]>();
      // Forever kennt nur eine Schwierigkeit: die erste, die Blizzard liefert, zählt als Normal
      for (const m of forever ? (inst.modes ?? []).slice(0, 1) : inst.modes ?? []) {
        const difficulty = forever ? 'normal' : String(m.difficulty?.type ?? '').toLowerCase();
        if (!['normal', 'heroic', 'mythic'].includes(difficulty)) continue;
        for (const e of m.progress?.encounters ?? []) {
          const id = e.encounter?.id ?? 0;
          const boss = bosses.get(id) ?? { id, name: e.encounter?.name ?? '', kills: { normal: 0, heroic: 0, mythic: 0 }, last: { normal: 0, heroic: 0, mythic: 0 } };
          boss.kills[difficulty as 'normal'] = e.completed_count ?? 0;
          boss.last[difficulty as 'normal'] = e.last_kill_timestamp ?? 0;
          bosses.set(id, boss);
        }
      }
      return { id: inst.instance?.id ?? 0, name: inst.instance?.name ?? '', bosses: [...bosses.values()] };
    }),
  };

  return {
    snapshot,
    realmSlug,
    demo: false,
    character: {
      name: profile.surname ? `${profile.name} ${tr(profile.surname)}` : profile.name,
      // Forever: Regelwerk (z. B. PvP) statt Realm
      realm: tr(profile.realm?.name ?? profile.ruleset?.name),
      guild: profile.guild?.name ?? '',
      // Forever liefert keine Spezialisierung, dann nur die Klasse
      spec: profile.active_spec ? spec(tr(profile.active_spec.name), tr(profile.character_class?.name)) : tr(profile.character_class?.name),
      level: profile.level ?? 0,
      ilvl: profile.equipped_item_level ?? 0,
      avatar: media?.assets?.find((a: Json) => a.key === 'avatar')?.value ?? null,
      // Heldentalent (seit The War Within), fehlt es bei Blizzard, bleibt es leer
      hero: tr(profile.active_hero_talent_tree?.name),
    },
    stats: stats && {
      crit: pct(stats.melee_crit?.value, stats.ranged_crit?.value, stats.spell_crit?.value),
      haste: pct(stats.melee_haste?.value, stats.ranged_haste?.value, stats.spell_haste?.value),
      mastery: pct(stats.mastery?.value),
      versatility: pct(stats.versatility_damage_done_bonus),
      ...mainStats(stats),
    },
    mplus: {
      score,
      // Farbe der Wertung, wie im Spiel und auf der Arsenal-Seite
      color: hex(season?.mythic_rating?.color),
      scorePct: Math.min(100, Math.round((score / SCORE_FULL) * 100)),
      bestKey: Math.max(0, ...timed.map((run) => run.keystone_level)),
      timed: timed.length,
      total: SEASON_DUNGEONS,
      runs: await Promise.all(best.slice(0, 5).map(async (run) => ({
        key: run.keystone_level,
        name: tr(run.dungeon?.name),
        time: mmss(run.duration),
        result: await upgrades(run),
      }))),
    },
    raid: {
      name: instance ? tr(instance.instance?.name) : '',
      season: null,
      bosses: (forever ? instance?.modes?.[0]?.progress?.total_count : null) ?? mode('NORMAL')?.total_count ?? mode('HEROIC')?.total_count ?? mode('MYTHIC')?.total_count ?? 0,
      difficulties: (['normal', 'heroic', 'mythic'] as const).map((id) => {
        // Forever kennt nur eine Schwierigkeit: die erste, die Blizzard liefert
        const progress = forever && id === 'normal' ? instance?.modes?.[0]?.progress : mode(id.toUpperCase());
        return {
          id,
          killed: progress?.completed_count ?? 0,
          kills: (progress?.encounters ?? []).reduce((sum: number, e: Json) => sum + (e.completed_count ?? 0), 0),
          // Parses gibt es nur bei Warcraft Logs
          parse: null,
        };
      }),
    },
  };
}

/** Hauptattribut (das höchste von Stärke, Beweglichkeit, Intelligenz), Leben und Tertiärwerte in Prozent */
function mainStats(stats: Json) {
  const primary = (['strength', 'agility', 'intellect'] as const)
    .map((id) => ({ id, value: Math.round(Number(stats[id]?.effective) || 0) }))
    .reduce((best, x) => (x.value > best.value ? x : best));
  const one = (v: unknown) => Math.round((Number(v) || 0) * 10) / 10;
  return {
    primary: primary.value > 0 ? primary : null,
    health: Math.round(Number(stats.health) || 0) || null,
    leech: one(stats.lifesteal?.value),
    avoidance: one(stats.avoidance?.value),
    speed: one(stats.speed?.value),
  };
}

/** Blizzard-Farbe {r, g, b, a} (0-255) als #rrggbb */
function hex(c: Json | undefined) {
  if (!c || ![c.r, c.g, c.b].every((v) => Number.isFinite(Number(v)))) return null;
  return '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')).join('');
}

export type LiveState = Omit<NonNullable<Awaited<ReturnType<typeof fetchLive>>>, 'snapshot' | 'realmSlug'>;

const REFRESH_MS = 5 * 60 * 1000;

/** Hält die letzten echten Daten vor und fragt höchstens alle fünf Minuten neu an. */
export class Live {
  state: LiveState | null = null;
  status: Status = 'loading';
  /** Realm als Slug, wie Blizzard ihn kennt; Warcraft Logs nutzt denselben */
  realmSlug = '';
  private key = '';
  private at = 0;
  private running: Promise<void> | null = null;

  constructor(private blizzard: Blizzard, private onChange: () => void, private onSnapshot: (character: string, snapshot: Snapshot) => void = () => {}) {}

  /** Charakter ohne Sprache, für den Verlauf */
  static character(settings: Settings) {
    return [settings.game, settings.region, settings.realm, settings.name].map((v) => v.trim().toLowerCase()).join('/');
  }

  /** Startet bei Bedarf im Hintergrund eine Abfrage; das Ergebnis kommt über onChange. */
  refresh(settings: Settings) {
    const key = [settings.game, settings.region, settings.realm, settings.name, settings.lang].map((v) => v.trim().toLowerCase()).join('/');
    if (this.running || (key === this.key && Date.now() - this.at < REFRESH_MS)) return;
    if (key !== this.key) {
      // Anderer Charakter: alte Daten nicht mehr zeigen
      this.state = null;
      this.status = 'loading';
      this.realmSlug = '';
    }
    this.key = key;
    this.at = Date.now();
    this.running = fetchLive(settings, this.blizzard)
      .then((result) => {
        if (result) {
          const { snapshot, realmSlug, ...state } = result;
          this.state = state;
          this.realmSlug = realmSlug;
          this.onSnapshot(Live.character(settings), snapshot);
        } else this.state = null;
        this.status = result ? 'live' : 'notFound';
      })
      .catch((error) => {
        console.warn('WowWatchr: Blizzard nicht erreichbar:', error.message);
        this.status = 'offline';
      })
      .finally(() => {
        this.running = null;
        this.onChange();
      });
  }
}

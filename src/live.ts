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
  async get(region: Region, path: string, namespace: 'profile' | 'dynamic') {
    const url = `https://${region}.api.blizzard.com${path}?namespace=${namespace}-${region}`;
    return getJson(this.fetchFn, url, { headers: { Authorization: `Bearer ${await this.auth()}` } });
  }

  /** Für Daten, die sich nur mit Patches ändern (Realms, Dungeons). */
  async cached(region: Region, path: string) {
    const key = region + path;
    if (!this.cache.has(key)) this.cache.set(key, await this.get(region, path, 'dynamic'));
    return this.cache.get(key) ?? null;
  }
}

export async function fetchLive(settings: Settings, blizzard: Blizzard) {
  const { region, lang } = settings;
  const locale = LOCALES[lang];
  const tr = (names: Json | string | undefined) => (typeof names === 'string' ? names : names?.[locale] ?? names?.en_US ?? '');

  // Realm in jeder Sprache (z. B. „Гордунни“) oder als Slug
  const realms = await blizzard.cached(region, '/data/wow/realm/index');
  const wanted = settings.realm.trim().toLowerCase();
  const realm = realms?.realms?.find((r: Json) => r.slug === slug(wanted) || Object.values(r.name ?? {}).some((n) => String(n).toLowerCase() === wanted))?.slug ?? slug(wanted);

  const path = `/profile/wow/character/${realm}/${encodeURIComponent(settings.name.trim().toLowerCase())}`;
  const profile = await blizzard.get(region, path, 'profile');
  if (!profile) return null;

  const seasons = await blizzard.get(region, '/data/wow/mythic-keystone/season/index', 'dynamic');
  const [stats, media, raids, season] = await Promise.all([
    blizzard.get(region, `${path}/statistics`, 'profile'),
    blizzard.get(region, `${path}/character-media`, 'profile'),
    blizzard.get(region, `${path}/encounters/raids`, 'profile'),
    seasons?.current_season ? blizzard.get(region, `${path}/mythic-keystone-profile/season/${seasons.current_season.id}`, 'profile') : null,
  ]);

  // Pro Dungeon der beste Run der Saison, neueste zuerst
  const best: Json[] = (season?.best_runs ?? []).toSorted((a: Json, b: Json) => b.completed_timestamp - a.completed_timestamp);
  const timed = best.filter((run) => run.is_completed_within_time);
  // Stufen (+1 bis +3) stehen nur in den Dungeon-Daten: Zeitgrenzen pro Stufe
  const upgrades = async (run: Json) => {
    if (!run.is_completed_within_time) return -1;
    const dungeon = await blizzard.cached(region, `/data/wow/mythic-keystone/dungeon/${run.dungeon.id}`);
    const steps = (dungeon?.keystone_upgrades ?? []).filter((u: Json) => run.duration <= u.qualifying_duration).length;
    return Math.max(1, steps);
  };

  // Aktueller Raid: der aus der neuesten Erweiterung, in dem zuletzt ein Boss fiel
  const lastKill = (instance: Json) =>
    Math.max(0, ...(instance.modes ?? []).flatMap((m: Json) => m.progress?.encounters ?? []).map((e: Json) => e.last_kill_timestamp ?? 0));
  const newest = raids?.expansions?.at(-1)?.instances ?? [];
  const instance: Json | undefined = newest.toSorted((a: Json, b: Json) => lastKill(b) - lastKill(a))[0];
  const mode = (type: string) => instance?.modes?.find((m: Json) => m.difficulty?.type === type)?.progress;

  const pct = (...values: unknown[]) => Math.round(Math.max(...values.map((v) => Number(v) || 0)));
  const spec = { de: (s: string, c: string) => `${s}-${c}`, en: (s: string, c: string) => `${s} ${c}`, fr: (s: string, c: string) => `${c} ${s}`, ru: (s: string, c: string) => `${c} «${s}»` }[lang];
  const score = Math.round(season?.mythic_rating?.rating ?? 0);

  return {
    demo: false,
    character: {
      name: profile.name,
      realm: tr(profile.realm?.name),
      guild: profile.guild?.name ?? '',
      spec: spec(tr(profile.active_spec?.name), tr(profile.character_class?.name)),
      ilvl: profile.equipped_item_level ?? 0,
      avatar: media?.assets?.find((a: Json) => a.key === 'avatar')?.value ?? null,
    },
    stats: stats && {
      crit: pct(stats.melee_crit?.value, stats.ranged_crit?.value, stats.spell_crit?.value),
      haste: pct(stats.melee_haste?.value, stats.ranged_haste?.value, stats.spell_haste?.value),
      mastery: pct(stats.mastery?.value),
      versatility: pct(stats.versatility_damage_done_bonus),
    },
    mplus: {
      score,
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
      bosses: mode('NORMAL')?.total_count ?? mode('HEROIC')?.total_count ?? mode('MYTHIC')?.total_count ?? 0,
      difficulties: (['normal', 'heroic', 'mythic'] as const).map((id) => {
        const progress = mode(id.toUpperCase());
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

export type LiveState = NonNullable<Awaited<ReturnType<typeof fetchLive>>>;

const REFRESH_MS = 5 * 60 * 1000;

/** Hält die letzten echten Daten vor und fragt höchstens alle fünf Minuten neu an. */
export class Live {
  state: LiveState | null = null;
  status: Status = 'loading';
  private key = '';
  private at = 0;
  private running: Promise<void> | null = null;

  constructor(private blizzard: Blizzard, private onChange: () => void) {}

  /** Startet bei Bedarf im Hintergrund eine Abfrage; das Ergebnis kommt über onChange. */
  refresh(settings: Settings) {
    const key = [settings.region, settings.realm, settings.name, settings.lang].map((v) => v.trim().toLowerCase()).join('/');
    if (this.running || (key === this.key && Date.now() - this.at < REFRESH_MS)) return;
    if (key !== this.key) {
      // Anderer Charakter: alte Daten nicht mehr zeigen
      this.state = null;
      this.status = 'loading';
    }
    this.key = key;
    this.at = Date.now();
    this.running = fetchLive(settings, this.blizzard)
      .then((state) => {
        this.state = state;
        this.status = state ? 'live' : 'notFound';
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

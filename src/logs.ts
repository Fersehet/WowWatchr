import type { DatabaseSync } from 'node:sqlite';
import type { Region } from './settings.ts';

/**
 * Warcraft Logs (eigener Schlüssel in der .env): Versuche, Kampfzeiten und Werte pro Spieler.
 * Gibt es nur, wenn jemand aus der Gruppe den Kampf geloggt und hochgeladen hat.
 */

type Json = Record<string, any>;
type Fetch = typeof fetch;

const ORIGIN = 'https://www.warcraftlogs.com';
// Ältere Logs ändern sich nicht mehr, neuere können noch wachsen (Live-Logging)
const FINAL_AFTER_MS = 6 * 60 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;

export interface Fight {
  id: number;
  name: string;
  encounterId: number;
  start: number; // ms seit Log-Beginn
  end: number;
  kill: boolean;
  difficulty: number; // 3 Normal, 4 Heroisch, 5 Mythisch, 10 Mythisch+
  percent: number | null; // wie weit der Boss noch war, bei Wipes
  keyLevel: number | null;
  keyTime: number | null;
  keyBonus: number | null; // 0 = Zeit überschritten, 1 bis 3 = Stufen
}

export interface Report {
  code: string;
  title: string;
  start: number;
  end: number;
  zone: string;
  fights: Fight[];
}

export interface PlayerStats {
  name: string;
  dps: number;
  hps: number;
  deaths: number;
  interrupts: number;
  parse: number | null;
}

const REPORTS = `query($name: String!, $server: String!, $region: String!) {
  characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
    recentReports(limit: 10) { data { code title startTime endTime zone { name } } }
  } }
}`;

const FIGHTS = `query($code: String!) {
  reportData { report(code: $code) {
    fights(killType: Encounters) { id name encounterID startTime endTime kill difficulty fightPercentage keystoneLevel keystoneTime keystoneBonus }
  } }
}`;

const STATS = `query($code: String!, $fights: [Int]) {
  reportData { report(code: $code) {
    damage: table(dataType: DamageDone, fightIDs: $fights)
    healing: table(dataType: Healing, fightIDs: $fights)
    deaths: table(dataType: Deaths, fightIDs: $fights)
    interrupts: table(dataType: Interrupts, fightIDs: $fights)
    rankings(fightIDs: $fights)
  } }
}`;

export class WarcraftLogs {
  private token = '';
  private tokenUntil = 0;

  constructor(private id: string, private secret: string, private fetchFn: Fetch = fetch) {}

  get enabled() {
    return Boolean(this.id && this.secret);
  }

  private async auth() {
    if (Date.now() < this.tokenUntil) return this.token;
    const res = await this.fetchFn(`${ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.id}:${this.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Warcraft-Logs-Schlüssel abgelehnt (${res.status})`);
    const data = (await res.json()) as Json;
    this.token = data.access_token;
    this.tokenUntil = Date.now() + (data.expires_in - 60) * 1000;
    return this.token;
  }

  async query(query: string, variables: Json) {
    const res = await this.fetchFn(`${ORIGIN}/api/v2/client`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.auth()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Warcraft Logs ${res.status}`);
    const body = (await res.json()) as Json;
    if (body.errors?.length && !body.data) throw new Error(`Warcraft Logs: ${body.errors[0].message}`);
    return body.data as Json;
  }
}

/** Sucht in den verschachtelten Tabellen von Warcraft Logs die Zeilen pro Spieler. */
function entries(table: Json | undefined): Json[] {
  const data = table?.data ?? table;
  return Array.isArray(data?.entries) ? data.entries : [];
}

/** Unterbrechungen stehen pro unterbrochenem Zauber, darin pro Spieler unter „details“ */
function interruptsBy(table: Json | undefined) {
  const counts = new Map<string, number>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const obj = node as Json;
    // Zeile mit „details“ ist die unterste Ebene, darunter nicht weiter zählen
    if (Array.isArray(obj.details)) {
      for (const d of obj.details) if (d?.name) counts.set(d.name, (counts.get(d.name) ?? 0) + (Number(d.total ?? d.count) || 0));
      return;
    }
    for (const child of Object.values(obj)) visit(child);
  };
  visit(table);
  return counts;
}

export function playerStats(report: Json): PlayerStats[] {
  const totalTime = Number(report.damage?.data?.totalTime ?? report.healing?.data?.totalTime) || 0;
  const seconds = Math.max(1, totalTime / 1000);
  const healing = new Map(entries(report.healing).map((e) => [e.name, Number(e.total) || 0]));
  const deaths = new Map<string, number>();
  for (const e of entries(report.deaths)) deaths.set(e.name, (deaths.get(e.name) ?? 0) + 1);
  const interrupts = interruptsBy(report.interrupts);
  const parses = new Map<string, number>();
  for (const fight of report.rankings?.data ?? []) {
    for (const role of Object.values(fight.roles ?? {}) as Json[]) {
      for (const c of role?.characters ?? []) if (c?.name && typeof c.rankPercent === 'number') parses.set(c.name, Math.round(c.rankPercent));
    }
  }
  return entries(report.damage)
    .filter((e) => e.type !== 'Pet' && e.type !== 'NPC')
    .map((e) => ({
      name: e.name,
      dps: Math.round((Number(e.total) || 0) / seconds),
      hps: Math.round((healing.get(e.name) ?? 0) / seconds),
      deaths: deaths.get(e.name) ?? 0,
      interrupts: interrupts.get(e.name) ?? 0,
      parse: parses.get(e.name) ?? null,
    }))
    .sort((a, b) => b.dps - a.dps);
}

/** Holt die letzten Logs des Charakters und merkt sie sich, Spielerwerte erst beim Aufklappen. */
export class Logs {
  status: 'off' | 'loading' | 'live' | 'notFound' | 'offline' = 'off';
  private key = '';
  private at = 0;
  private running: Promise<void> | null = null;

  constructor(private wcl: WarcraftLogs, private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        character TEXT NOT NULL,
        code TEXT NOT NULL,
        start INTEGER NOT NULL,
        final INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (character, code)
      );
      CREATE TABLE IF NOT EXISTS fight_stats (
        code TEXT NOT NULL,
        fight INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (code, fight)
      );
    `);
  }

  get enabled() {
    return this.wcl.enabled;
  }

  refresh(character: string, who: { name: string; realm: string; region: Region }) {
    if (!this.wcl.enabled) return;
    if (this.running || (character === this.key && Date.now() - this.at < REFRESH_MS)) return;
    if (character !== this.key) this.status = 'loading';
    this.key = character;
    this.at = Date.now();
    this.running = this.load(character, who)
      .catch((error) => {
        console.warn('WowWatchr: Warcraft Logs nicht erreichbar:', error.message);
        this.status = 'offline';
      })
      .finally(() => (this.running = null));
  }

  private async load(character: string, who: { name: string; realm: string; region: Region }) {
    const data = await this.wcl.query(REPORTS, { name: who.name, server: who.realm, region: who.region });
    const found = data?.characterData?.character;
    if (!found) {
      this.status = 'notFound';
      return;
    }
    const known = this.db.prepare('SELECT final FROM logs WHERE character = ? AND code = ?');
    const save = this.db.prepare('INSERT OR REPLACE INTO logs (character, code, start, final, data) VALUES (?, ?, ?, ?, ?)');
    for (const r of found.recentReports?.data ?? []) {
      if ((known.get(character, r.code) as { final: number } | undefined)?.final) continue;
      const fights = (await this.wcl.query(FIGHTS, { code: r.code }))?.reportData?.report?.fights ?? [];
      const report: Report = {
        code: r.code,
        title: r.title ?? '',
        start: r.startTime,
        end: r.endTime,
        zone: r.zone?.name ?? '',
        fights: fights.map((f: Json): Fight => ({
          id: f.id,
          name: f.name ?? '',
          encounterId: f.encounterID ?? 0,
          start: f.startTime,
          end: f.endTime,
          kill: Boolean(f.kill),
          difficulty: f.difficulty ?? 0,
          percent: typeof f.fightPercentage === 'number' ? Math.round(f.fightPercentage * 10) / 10 : null,
          keyLevel: f.keystoneLevel ?? null,
          keyTime: f.keystoneTime ?? null,
          keyBonus: f.keystoneBonus ?? null,
        })),
      };
      save.run(character, r.code, r.startTime, Number(Date.now() - r.endTime > FINAL_AFTER_MS), JSON.stringify(report));
    }
    this.status = 'live';
  }

  reports(character: string, limit = 10): Report[] {
    return (this.db.prepare('SELECT data FROM logs WHERE character = ? ORDER BY start DESC LIMIT ?').all(character, limit) as { data: string }[]).map((r) => JSON.parse(r.data));
  }

  /** Werte pro Spieler für einen Kampf; abgeschlossene Logs werden gespeichert. */
  async fight(code: string, fight: number): Promise<PlayerStats[]> {
    const cached = this.db.prepare('SELECT data FROM fight_stats WHERE code = ? AND fight = ?').get(code, fight) as { data: string } | undefined;
    if (cached) return JSON.parse(cached.data);
    const report = (await this.wcl.query(STATS, { code, fights: [fight] }))?.reportData?.report;
    const stats = report ? playerStats(report) : [];
    // Abgeschlossene Logs, und fertige Runs und Kills auch in noch wachsenden Logs, ändern sich nicht mehr: auf dem Server behalten
    const row = this.db.prepare('SELECT final, data FROM logs WHERE code = ?').get(code) as { final: number; data: string } | undefined;
    const f = row ? (JSON.parse(row.data) as Report).fights.find((x) => x.id === fight) : undefined;
    const final = row?.final || f?.keyTime != null || f?.kill;
    if (final && stats.length) this.db.prepare('INSERT OR REPLACE INTO fight_stats (code, fight, data) VALUES (?, ?, ?)').run(code, fight, JSON.stringify(stats));
    return stats;
  }
}

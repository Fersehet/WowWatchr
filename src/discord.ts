import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { buildPost, pick, type Event, type LogInfo, type Look, type Post } from './discord-format.ts';
import type { Difficulty, NewKill, Run } from './history.ts';
import { fightLink, type Fight, type PlayerStats, type Report } from './logs.ts';

/**
 * Discord-Posts über einen Webhook: ein Post pro neuem Bestwert oder Boss-Kill, sofort.
 * Kommt später das Warcraft-Logs-Log, wird derselbe Post um Versuche, Kampfzeit und Spielerwerte ergänzt.
 * Der Webhook-Link ist wie ein Passwort: er liegt nur auf dem Server und geht nie zurück an den Browser.
 */

type Fetch = typeof fetch;

// Nur echte Discord-Webhooks, damit der Server keine beliebigen Adressen aufruft
const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)$/;
// So lange wird auf ein Log gewartet (und ein nicht zugestellter Post erneut versucht)
const PENDING_MS = 24 * 60 * 60 * 1000;
// Wie weit Blizzard-Zeit und Log-Zeit auseinander liegen dürfen
const MATCH_MS = 20 * 60 * 1000;
const WCL_DIFF: Record<number, Difficulty> = { 3: 'normal', 4: 'heroic', 5: 'mythic' };

export const validWebhook = (url: string) => WEBHOOK.test(url);

interface Row {
  id: number;
  at: number;
  event: string;
  message: string | null;
  log: string | null;
}

export class Discord {
  private busy = false;

  constructor(private db: DatabaseSync, private file: string, private fetchFn: Fetch = fetch) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS discord_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character TEXT NOT NULL,
        at INTEGER NOT NULL,
        event TEXT NOT NULL,
        message TEXT,
        log TEXT,
        done INTEGER NOT NULL DEFAULT 0
      );
    `);
    // ref = Kampf im Log (code:fight) bei Runs aus Warcraft Logs, damit jeder nur einmal gepostet wird
    const columns = db.prepare('PRAGMA table_info(discord_posts)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'ref')) db.exec('ALTER TABLE discord_posts ADD COLUMN ref TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_ref ON discord_posts (ref)');
    // Ab wann Runs aus Warcraft Logs gepostet werden: ab dem Verbinden, bei bestehenden Installationen ab diesem Update
    db.exec('CREATE TABLE IF NOT EXISTS discord_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
    db.prepare("INSERT OR IGNORE INTO discord_meta (key, value) VALUES ('since', ?)").run(Date.now());
  }

  private get since() {
    return (this.db.prepare("SELECT value FROM discord_meta WHERE key = 'since'").get() as { value: number }).value;
  }

  get url() {
    return existsSync(this.file) ? readFileSync(this.file, 'utf8').trim() : '';
  }

  get connected() {
    return validWebhook(this.url);
  }

  /** Leer = Verbindung trennen */
  setUrl(url: string) {
    url = url.trim();
    if (!url) return void rmSync(this.file, { force: true });
    if (!validWebhook(url)) throw new Error('invalid');
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, url, { mode: 0o600 });
    this.db.prepare("UPDATE discord_meta SET value = ? WHERE key = 'since'").run(Date.now());
    chmodSync(this.file, 0o600);
  }

  private async call(method: 'POST' | 'PATCH', path: string, post: Post, retry = true): Promise<{ id: string }> {
    let body: FormData | string;
    const headers: Record<string, string> = {};
    if (post.image) {
      // Bild als Anhang, die Karte verweist mit attachment://wowwatchr.png darauf
      const payload = { ...post.payload, attachments: [{ id: 0, filename: 'wowwatchr.png' }] };
      body = new FormData();
      body.append('payload_json', JSON.stringify(payload));
      body.append('files[0]', new Blob([new Uint8Array(post.image)], { type: 'image/png' }), 'wowwatchr.png');
    } else {
      body = JSON.stringify({ ...post.payload, attachments: [] });
      headers['Content-Type'] = 'application/json';
    }
    const res = await this.fetchFn(`${this.url}${path}`, { method, headers, body, signal: AbortSignal.timeout(15_000) });
    if (res.status === 429 && retry) {
      const wait = Number((await res.json().catch(() => ({})))?.retry_after) || 1;
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
      return this.call(method, path, post, false);
    }
    if (!res.ok) throw Object.assign(new Error(`Discord ${res.status}`), { status: res.status });
    return (await res.json()) as { id: string };
  }

  async send(post: Post) {
    return (await this.call('POST', '?wait=true', post)).id;
  }

  async edit(message: string, post: Post) {
    await this.call('PATCH', `/messages/${message}`, post);
  }

  /** Neue Bestwerte und Kills aus History.save(): merken und gleich posten */
  async announce(character: string, fresh: { runs: Run[]; kills: NewKill[] }, look: Look, me: string) {
    if (!this.connected) return;
    const insert = this.db.prepare('INSERT INTO discord_posts (character, at, event) VALUES (?, ?, ?)');
    // Gibt es den Run schon als Post aus Warcraft Logs, wird dieser Post zum Bestwert umgeschrieben statt doppelt gepostet
    const logged = this.db.prepare('SELECT id, event FROM discord_posts WHERE character = ? AND ref IS NOT NULL AND at BETWEEN ? AND ?');
    const upgrade = this.db.prepare('UPDATE discord_posts SET event = ?, log = NULL, done = 0 WHERE id = ?');
    for (const run of fresh.runs) {
      const event = JSON.stringify({ kind: 'run', run } satisfies Event);
      const twin = (logged.all(character, run.at - MATCH_MS, run.at + MATCH_MS) as { id: number; event: string }[])
        .find((r) => (JSON.parse(r.event) as Event).kind === 'run' && (JSON.parse(r.event) as { run: Run }).run.key === run.key);
      if (twin) upgrade.run(event, twin.id);
      else insert.run(character, run.at, event);
    }
    for (const { killed, total, ...kill } of fresh.kills) insert.run(character, kill.at, JSON.stringify({ kind: 'kill', kill, killed, total } satisfies Event));
    await this.work(character, look, me, [], async () => []);
  }

  /** Jeder Dungeon aus Warcraft Logs seit dem Verbinden wird ein Post, auch wenn er kein Bestwert ist (die kennt Blizzard schon). */
  private collect(character: string, reports: Report[]) {
    const since = this.since; // nichts von vor dem Verbinden posten
    // Derselbe Run kann in mehreren Logs stehen (jeder aus der Gruppe lädt hoch) oder schon als Bestwert gepostet sein
    const nearby = this.db.prepare('SELECT event FROM discord_posts WHERE character = ? AND at BETWEEN ? AND ?');
    const insert = this.db.prepare('INSERT OR IGNORE INTO discord_posts (character, at, event, ref) VALUES (?, ?, ?, ?)');
    for (const report of reports) {
      for (const f of report.fights) {
        if (f.keyLevel == null || f.keyTime == null) continue;
        const at = report.start + f.end;
        if (at < since) continue;
        const best = (nearby.all(character, at - MATCH_MS, at + MATCH_MS) as { event: string }[])
          .some((r) => { const e = JSON.parse(r.event) as Event; return e.kind === 'run' && e.run.key === f.keyLevel; });
        if (best) continue; // schon gepostet, das Log wird dort ergänzt
        const run: Run = { at, season: 0, dungeonId: f.encounterId, dungeon: f.name, key: f.keyLevel, ms: f.keyTime, limit: 0, result: f.keyBonus ? f.keyBonus : -1, rating: 0, affixes: [], members: [] };
        insert.run(character, at, JSON.stringify({ kind: 'run', run, logged: true } satisfies Event), `${report.code}:${f.id}`);
      }
    }
  }

  /**
   * Offene Posts abarbeiten: nicht zugestellte erneut senden, passende Logs ergänzen.
   * `stats` holt die Spielerwerte eines Kampfes aus Warcraft Logs.
   */
  async work(character: string, look: Look, me: string, reports: Report[], stats: (code: string, fight: number) => Promise<PlayerStats[]>) {
    if (!this.connected || this.busy) return;
    this.busy = true;
    try {
      this.collect(character, reports);
      const rows = this.db.prepare('SELECT id, at, event, message, log FROM discord_posts WHERE character = ? AND done = 0 ORDER BY at').all(character) as unknown as Row[];
      for (const row of rows) {
        const event = JSON.parse(row.event) as Event;
        const stale = Date.now() - row.at > PENDING_MS;
        let log = row.log ? (JSON.parse(row.log) as LogInfo) : null;
        const found = log ? null : findLog(event, reports);
        if (found) {
          // Warcraft Logs gerade nicht erreichbar oder noch leer: beim nächsten Durchlauf erneut versuchen
          const players = await stats(found.code, found.fight).catch(() => []);
          if (players.length) log = { ...found.info, players, link: fightLink(found.code, found.fight) };
          else if ((row.message || isLogged(event)) && !stale) continue;
        }
        // Ein Log von jemand anderem kann Runs ohne den eigenen Charakter enthalten: die nicht posten
        if (isLogged(event) && !row.message && !log?.players.some((p) => p.name.toLowerCase() === me.toLowerCase())) {
          this.db.prepare('UPDATE discord_posts SET done = 1 WHERE id = ?').run(row.id);
          continue;
        }
        try {
          let message = row.message;
          if (!message) message = await this.send(buildPost(event, log, look, me));
          else if (log && !row.log) await this.edit(message, buildPost(event, log, look, me));
          const done = Boolean(log) || !look.logsEnabled || stale;
          // Hat announce() den Post inzwischen zum Bestwert umgeschrieben, nur die Nachrichten-ID behalten: der nächste Durchlauf bearbeitet ihn
          const saved = this.db.prepare('UPDATE discord_posts SET message = ?, log = ?, done = ? WHERE id = ? AND event = ?').run(message, log ? JSON.stringify(log) : null, Number(done), row.id, row.event);
          if (!saved.changes) this.db.prepare('UPDATE discord_posts SET message = ? WHERE id = ? AND message IS NULL').run(message, row.id);
        } catch (error) {
          console.warn('WowWatchr: Discord-Post fehlgeschlagen:', (error as Error).message);
          // Discord lehnt genau diesen Post ab (z. B. im Kanal gelöscht, neuer Webhook): aufgeben, die anderen nicht aufhalten
          const status = (error as { status?: number }).status ?? 0;
          if (stale || (status >= 400 && status < 500)) {
            this.db.prepare('UPDATE discord_posts SET done = 1 WHERE id = ?').run(row.id);
            continue;
          }
          break; // Discord gerade nicht erreichbar: beim nächsten Durchlauf weiter
        }
      }
    } finally {
      this.busy = false;
    }
  }
}

const isLogged = (event: Event) => event.kind === 'run' && Boolean(event.logged);

/** Sucht im Log den Kampf zum Run bzw. Kill, wie die Statistik-Seite: zeitlich am nächsten, bei Bossen mit gleichem Namen */
export function findLog(event: Event, reports: Report[]): { code: string; fight: number; info: Omit<LogInfo, 'players'> } | null {
  const when = event.kind === 'run' ? event.run.at : event.kill.at;
  const boss = event.kind === 'kill' ? pick(event.kill.boss, 'en').toLowerCase() : '';
  let best: { report: Report; f: Fight; off: number } | null = null;
  for (const report of reports) {
    for (const f of report.fights) {
      const fits = event.kind === 'run'
        ? f.keyLevel === event.run.key && f.keyTime != null
        : f.kill && f.keyLevel == null && WCL_DIFF[f.difficulty] === event.kill.difficulty && (!boss || f.name.toLowerCase() === boss);
      const off = Math.abs(report.start + f.end - when);
      if (fits && off < MATCH_MS && (!best || off < best.off)) best = { report, f, off };
    }
  }
  if (!best) return null;
  const { report, f } = best;
  if (event.kind === 'run') return { code: report.code, fight: f.id, info: { tries: null, fightMs: f.keyTime ?? f.end - f.start, bestWipe: null } };
  const tries = report.fights.filter((x) => x.encounterId === f.encounterId && x.difficulty === f.difficulty && x.start <= f.start);
  const wipes = tries.filter((x) => !x.kill && x.percent != null).map((x) => x.percent as number);
  return { code: report.code, fight: f.id, info: { tries: tries.length, fightMs: f.end - f.start, bestWipe: wipes.length ? Math.min(...wipes) : null } };
}

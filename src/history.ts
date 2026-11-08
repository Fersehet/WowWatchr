import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Verlauf für die Statistik-Seite, gespeichert auf dem Server wie bei FaceitWatchr.
 * Blizzard liefert keine Liste der letzten Runs, nur den besten Run pro Dungeon und pro Boss die Zahl der Kills.
 * Darum: jeden neuen Bestwert behalten und Kills zwischen zwei Abfragen vergleichen.
 */

/** Namen kommen von Blizzard in allen Sprachen, der Editor wählt seine Sprache selbst. */
export type Names = Record<string, string> | string;
export type Difficulty = 'normal' | 'heroic' | 'mythic';

export interface Run {
  at: number;
  dungeonId: number;
  dungeon: Names;
  key: number;
  ms: number;
  limit: number;
  result: number; // +1 bis +3, -1 = Zeit überschritten
  rating: number;
  affixes: Names[];
  members: { name: string; realm: Names; spec: Names; ilvl: number }[];
}

export interface Raid {
  id: number;
  name: Names;
  bosses: { id: number; name: Names; kills: Record<Difficulty, number>; last: number }[];
}

export interface Snapshot {
  runs: Run[];
  raids: Raid[];
}

export interface Kill {
  at: number;
  raid: Names;
  boss: Names;
  difficulty: Difficulty;
  count: number;
}

export class History {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        character TEXT NOT NULL,
        dungeon_id INTEGER NOT NULL,
        at INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (character, dungeon_id, at)
      );
      CREATE TABLE IF NOT EXISTS raids (
        character TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS boss_counts (
        character TEXT NOT NULL,
        boss_id INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (character, boss_id, difficulty)
      );
      CREATE TABLE IF NOT EXISTS kills (
        character TEXT NOT NULL,
        at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kills ON kills (character, at);
    `);
  }

  save(character: string, record: Snapshot) {
    const run = this.db.prepare('INSERT OR IGNORE INTO runs (character, dungeon_id, at, data) VALUES (?, ?, ?, ?)');
    for (const r of record.runs) run.run(character, r.dungeonId, r.at, JSON.stringify(r));

    const before = this.db.prepare('SELECT count FROM boss_counts WHERE character = ? AND boss_id = ? AND difficulty = ?');
    const count = this.db.prepare('INSERT OR REPLACE INTO boss_counts (character, boss_id, difficulty, count) VALUES (?, ?, ?, ?)');
    const kill = this.db.prepare('INSERT INTO kills (character, at, data) VALUES (?, ?, ?)');
    for (const raid of record.raids) {
      for (const boss of raid.bosses) {
        for (const [difficulty, now] of Object.entries(boss.kills) as [Difficulty, number][]) {
          const old = before.get(character, boss.id, difficulty) as { count: number } | undefined;
          // Erste Abfrage nur als Ausgangsstand: wann frühere Kills waren, weiß Blizzard nicht
          if (old && now > old.count) {
            kill.run(character, boss.last, JSON.stringify({ at: boss.last, raid: raid.name, boss: boss.name, difficulty, count: now - old.count } satisfies Kill));
          }
          count.run(character, boss.id, difficulty, now);
        }
      }
    }
    this.db.prepare('INSERT OR REPLACE INTO raids (character, data) VALUES (?, ?)').run(character, JSON.stringify(record.raids));
  }

  get(character: string, limit = 50) {
    const rows = (sql: string) => (this.db.prepare(sql).all(character, limit) as { data: string }[]).map((r) => JSON.parse(r.data));
    const raids = this.db.prepare('SELECT data FROM raids WHERE character = ?').get(character) as { data: string } | undefined;
    return {
      runs: rows('SELECT data FROM runs WHERE character = ? ORDER BY at DESC LIMIT ?') as Run[],
      kills: rows('SELECT data FROM kills WHERE character = ? ORDER BY at DESC LIMIT ?') as Kill[],
      raids: (raids ? JSON.parse(raids.data) : []) as Raid[],
    };
  }
}

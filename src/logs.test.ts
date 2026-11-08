import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Logs, playerStats, WarcraftLogs } from './logs.ts';

// Tabellen im Aufbau von Warcraft Logs, gekürzt auf die genutzten Felder
const TABLES = {
  damage: { data: { totalTime: 100_000, entries: [
    { name: 'Vaelric', type: 'Mage', icon: 'Mage-Frost', total: 50_000_000 },
    { name: 'Lyssia', type: 'Priest', icon: 'Priest-Holy', total: 2_000_000 },
    { name: 'Wasserelementar', type: 'Pet', total: 1_000_000 },
  ] } },
  healing: { data: { totalTime: 100_000, entries: [{ name: 'Lyssia', total: 40_000_000 }] } },
  deaths: { data: { entries: [{ name: 'Lyssia' }, { name: 'Lyssia' }] } },
  interrupts: { data: { entries: [{ entries: [{ name: 'Schattenblitz', details: [{ name: 'Vaelric', total: 3 }] }, { details: [{ name: 'Vaelric', total: 1 }] }] }] } },
  rankings: { data: [{ fightID: 9, roles: { dps: { characters: [{ name: 'Vaelric', rankPercent: 93.4 }] }, healers: { characters: [{ name: 'Lyssia', rankPercent: 61.2 }] } } }] },
};

test('Spielerwerte aus den Tabellen: DPS, HPS, Tode, Unterbrechungen, Parse, ohne Begleiter', () => {
  assert.deepEqual(playerStats(TABLES), [
    { name: 'Vaelric', dps: 500_000, hps: 0, deaths: 0, interrupts: 4, parse: 93 },
    { name: 'Lyssia', dps: 20_000, hps: 400_000, deaths: 2, interrupts: 0, parse: 61 },
  ]);
});

test('holt die letzten Logs, speichert Kämpfe und abgeschlossene Spielerwerte', async () => {
  const old = Date.now() - 2 * 86_400_000;
  const bodies: string[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.endsWith('/oauth/token')) return json({ access_token: 't', expires_in: 3600 });
    const { query, variables } = JSON.parse(String(init?.body));
    bodies.push(query);
    if (query.includes('recentReports')) {
      assert.deepEqual(variables, { name: 'Vaelric', server: 'blackrock', region: 'eu' });
      return json({ data: { characterData: { character: { recentReports: { data: [{ code: 'AbCdEfGhIjKlMnOp', title: 'Raid', startTime: old, endTime: old + 9_000_000, zone: { name: 'The Voidspire' } }] } } } } });
    }
    if (query.includes('fights(')) {
      return json({ data: { reportData: { report: { fights: [
        { id: 1, name: 'Boss', encounterID: 7, startTime: 10, endTime: 310, kill: false, difficulty: 5, fightPercentage: 34.56 },
        { id: 2, name: 'Boss', encounterID: 7, startTime: 400, endTime: 700, kill: true, difficulty: 5, fightPercentage: 0 },
      ] } } } });
    }
    return json({ data: { reportData: { report: TABLES } } });
  }) as typeof fetch;

  const logs = new Logs(new WarcraftLogs('id', 'secret', fetchFn), new DatabaseSync(':memory:'));
  logs.refresh('c', { name: 'Vaelric', realm: 'blackrock', region: 'eu' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(logs.status, 'live');
  const [report] = logs.reports('c');
  assert.equal(report.zone, 'The Voidspire');
  assert.deepEqual(report.fights.map((f) => [f.kill, f.percent, f.end - f.start]), [[false, 34.6, 300], [true, 0, 300]]);

  assert.equal((await logs.fight('AbCdEfGhIjKlMnOp', 2))[0].dps, 500_000);
  const calls = bodies.length;
  await logs.fight('AbCdEfGhIjKlMnOp', 2);
  assert.equal(bodies.length, calls, 'abgeschlossenes Log kommt aus der Datenbank');
});

test('ohne Schlüssel fragt Warcraft Logs nichts ab', () => {
  const logs = new Logs(new WarcraftLogs('', ''), new DatabaseSync(':memory:'));
  logs.refresh('c', { name: 'Vaelric', realm: 'blackrock', region: 'eu' });
  assert.equal(logs.status, 'off');
});

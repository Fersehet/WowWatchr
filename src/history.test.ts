import assert from 'node:assert/strict';
import { test } from 'node:test';
import { History, type Snapshot } from './history.ts';

const run = (at: number, key: number) => ({ at, dungeonId: 161, dungeon: 'Skyreach', key, ms: 1, limit: 2, result: 1, rating: 300, affixes: [], members: [] });
const raid = (heroic: number, last: number): Snapshot['raids'] => [{ id: 1, name: 'Raid', bosses: [{ id: 7, name: 'Boss', kills: { normal: 2, heroic, mythic: 0 }, last }] }];

test('behält alte Bestwerte, auch wenn Blizzard sie ersetzt', () => {
  const h = new History(':memory:');
  h.save('eu/vaelric', { runs: [run(10, 12)], raids: [] });
  h.save('eu/vaelric', { runs: [run(10, 12)], raids: [] });
  h.save('eu/vaelric', { runs: [run(20, 14)], raids: [] });
  assert.deepEqual(h.get('eu/vaelric').runs.map((r) => r.key), [14, 12]);
  assert.deepEqual(h.get('eu/other').runs, []);
});

test('neue Kills zwischen zwei Abfragen werden zu Einträgen, der erste Stand nicht', () => {
  const h = new History(':memory:');
  h.save('c', { runs: [], raids: raid(3, 100) });
  assert.deepEqual(h.get('c').kills, []);
  h.save('c', { runs: [], raids: raid(3, 100) });
  h.save('c', { runs: [], raids: raid(5, 200) });
  assert.deepEqual(h.get('c').kills, [{ at: 200, raid: 'Raid', boss: 'Boss', difficulty: 'heroic', count: 2 }]);
  assert.equal(h.get('c').raids[0].bosses[0].kills.heroic, 5);
});

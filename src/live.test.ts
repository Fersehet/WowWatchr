import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Blizzard, fetchLive, Live, slug } from './live.ts';
import { DEFAULTS, sanitize } from './settings.ts';

// Antworten im Aufbau der Blizzard-API, gekürzt auf die genutzten Felder
const CHAR = '/profile/wow/character/der-rat-von-dalaran/vaelric';
const names = (en: string, de: string) => ({ en_US: en, de_DE: de });
const API: Record<string, unknown> = {
  '/data/wow/realm/index': { realms: [{ slug: 'der-rat-von-dalaran', name: names('Der Rat von Dalaran', 'Der Rat von Dalaran') }] },
  '/data/wow/mythic-keystone/season/index': { current_season: { id: 17 } },
  '/data/wow/mythic-keystone/dungeon/161': { keystone_upgrades: [
    { upgrade_level: 1, qualifying_duration: 1_800_000 }, { upgrade_level: 2, qualifying_duration: 1_440_000 }, { upgrade_level: 3, qualifying_duration: 1_080_000 },
  ] },
  [CHAR]: {
    name: 'Vaelric', realm: { name: names('Der Rat von Dalaran', 'Der Rat von Dalaran') }, guild: { name: 'Silent Vigil' },
    equipped_item_level: 284, active_spec: { name: names('Frost', 'Frost') }, character_class: { name: names('Mage', 'Magier') },
  },
  [`${CHAR}/statistics`]: { melee_crit: { value: 12.1 }, spell_crit: { value: 24.4 }, spell_haste: { value: 30.6 }, mastery: { value: 46.2 }, versatility_damage_done_bonus: 8.1 },
  [`${CHAR}/character-media`]: { assets: [{ key: 'avatar', value: 'https://render.worldofwarcraft.com/eu/x-avatar.jpg' }] },
  [`${CHAR}/mythic-keystone-profile/season/17`]: {
    mythic_rating: { rating: 2847.4 },
    best_runs: [
      { completed_timestamp: 1, duration: 1_400_000, keystone_level: 14, is_completed_within_time: true, dungeon: { id: 161, name: names('Skyreach', 'Himmelsnadel') } },
      { completed_timestamp: 3, duration: 1_901_000, keystone_level: 15, is_completed_within_time: false, dungeon: { id: 556, name: names('Pit of Saron', 'Grube von Saron') } },
    ],
  },
  [`${CHAR}/encounters/raids`]: {
    expansions: [
      { instances: [{ instance: { name: names('Old Raid', 'Alter Raid') }, modes: [] }] },
      { instances: [
        { instance: { name: names('The Dreamrift', 'Der Traumriss') }, modes: [{ difficulty: { type: 'NORMAL' }, progress: { completed_count: 1, total_count: 1, encounters: [{ completed_count: 1, last_kill_timestamp: 5 }] } }] },
        { instance: { name: names('The Voidspire', 'Die Leerenspitze') }, modes: [
          { difficulty: { type: 'NORMAL' }, progress: { completed_count: 6, total_count: 6, encounters: [{ completed_count: 4, last_kill_timestamp: 9 }, { completed_count: 2 }] } },
          { difficulty: { type: 'HEROIC' }, progress: { completed_count: 4, total_count: 6, encounters: [{ completed_count: 3 }, { completed_count: 2 }] } },
        ] },
      ] },
    ],
  },
};

function fakeFetch(options: { token?: number; down?: boolean } = {}) {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.host === 'oauth.battle.net') return options.token ? json(options.token, {}) : json(200, { access_token: 't', expires_in: 86400 });
    if (options.down) return json(503, {});
    return url.pathname in API ? json(200, API[url.pathname]) : json(404, {});
  }) as typeof fetch;
  return { fn, calls };
}

const settings = sanitize({ name: 'Vaelric', realm: 'Der Rat von Dalaran', region: 'eu', lang: 'de' });

test('macht aus Realm-Namen Slugs', () => {
  assert.equal(slug(" Kel'Thuzad "), 'kelthuzad');
  assert.equal(slug('Der Rat von Dalaran'), 'der-rat-von-dalaran');
});

test('baut den Overlay-Zustand aus den Blizzard-Daten, auf Deutsch', async () => {
  const { fn } = fakeFetch();
  const state = await fetchLive(settings, new Blizzard('id', 'secret', fn));
  assert.ok(state);
  assert.deepEqual(state.character, {
    name: 'Vaelric', realm: 'Der Rat von Dalaran', guild: 'Silent Vigil', spec: 'Frost-Magier', ilvl: 284,
    avatar: 'https://render.worldofwarcraft.com/eu/x-avatar.jpg',
  });
  assert.deepEqual(state.stats, { crit: 24, haste: 31, mastery: 46, versatility: 8 });
  assert.deepEqual([state.mplus.score, state.mplus.bestKey, state.mplus.timed, state.mplus.total], [2847, 14, 1, 8]);
  // Neueste zuerst; 23:20 liegt unter der +2-Grenze (24:00), aber über +3 (18:00)
  assert.deepEqual(state.mplus.runs, [
    { key: 15, name: 'Grube von Saron', time: '31:41', result: -1 },
    { key: 14, name: 'Himmelsnadel', time: '23:20', result: 2 },
  ]);
  assert.equal(state.raid.name, 'Die Leerenspitze');
  assert.equal(state.raid.bosses, 6);
  assert.deepEqual(state.raid.difficulties.map((d) => [d.killed, d.kills, d.parse]), [[6, 6, null], [4, 5, null], [0, 0, null]]);
});

test('Spezialisierung in der Reihenfolge der Sprache', async () => {
  const { fn } = fakeFetch();
  const state = await fetchLive({ ...settings, lang: 'en' }, new Blizzard('id', 'secret', fn));
  assert.equal(state?.character.spec, 'Frost Mage');
  assert.equal(state?.mplus.runs[0].name, 'Pit of Saron');
});

test('unbekannter Charakter ergibt null, Ausfall oder falscher Schlüssel einen Fehler', async () => {
  const ok = fakeFetch();
  assert.equal(await fetchLive({ ...settings, name: 'Nobody' }, new Blizzard('id', 'secret', ok.fn)), null);
  const down = fakeFetch({ down: true });
  await assert.rejects(fetchLive(settings, new Blizzard('id', 'secret', down.fn)));
  const wrong = fakeFetch({ token: 401 });
  await assert.rejects(fetchLive(settings, new Blizzard('id', 'wrong', wrong.fn)), /401/);
});

test('Live fragt nicht bei jedem Aufruf neu an und behält Daten bei Ausfall', async () => {
  let down = false;
  let changed = 0;
  const { fn, calls } = fakeFetch();
  const flaky = (async (input: string | URL, init?: RequestInit) =>
    down && !String(input).includes('oauth') ? new Response('', { status: 503 }) : fn(input, init)) as typeof fetch;
  const live = new Live(new Blizzard('id', 'secret', flaky), () => changed++);
  live.refresh(settings);
  live.refresh(settings);
  await new Promise((r) => setTimeout(r, 20));
  const first = calls.length;
  live.refresh(settings);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, first);
  assert.equal(live.status, 'live');
  assert.equal(changed, 1);

  // Fünf Minuten später fällt Blizzard aus: letzte Daten bleiben
  down = true;
  (live as unknown as { at: number }).at = 0;
  live.refresh(settings);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(live.status, 'offline');
  assert.equal(live.state?.character.name, 'Vaelric');

  // Anderer Charakter: alte Daten weg
  live.refresh({ ...settings, name: 'Other' });
  assert.equal(live.state, null);
  assert.equal(live.status, 'loading');
});

test('Region fällt auf EU zurück', () => {
  assert.equal(sanitize({ region: 'cn' }).region, DEFAULTS.region);
  assert.equal(sanitize({ region: 'us' }).region, 'us');
});

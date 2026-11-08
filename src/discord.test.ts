import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TEXTS, buildPost, type Look } from './discord-format.ts';
import { Discord, findLog, validWebhook } from './discord.ts';
import { History, type Run, type Snapshot } from './history.ts';
import type { Report } from './logs.ts';

const HOOK = 'https://discord.com/api/webhooks/123/abc-DEF_9';
const LOOK: Look = { lang: 'en', style: 'table', accent: '#ffd100', diffColors: true, who: 'Vaelric · Blackrock (EU)', logsEnabled: true };
const run = (at: number, key: number): Run => ({
  at, season: 1, dungeonId: 161, dungeon: { en_US: 'Skyreach', de_DE: 'Himmelsnadel' }, key, ms: 1_500_000, limit: 1_800_000, result: 2, rating: 300,
  affixes: [{ en_US: 'Fortified' }], members: [{ name: 'Vaelric', realm: 'Blackrock', spec: { en_US: 'Frost Mage' }, ilvl: 284 }],
});
const raid = (heroic: number, last: number): Snapshot['raids'] => [{ id: 1, name: { en_US: 'Raid' }, bosses: [
  { id: 7, name: { en_US: 'Boss Seven' }, kills: { normal: 2, heroic, mythic: 0 }, last: { normal: 50, heroic: last, mythic: 0 } },
  { id: 8, name: { en_US: 'Boss Eight' }, kills: { normal: 1, heroic: 0, mythic: 0 }, last: { normal: 40, heroic: 0, mythic: 0 } },
] }];

/** Unechtes Discord: merkt sich alle Aufrufe und gibt fortlaufende Nachrichten-IDs */
function fakeDiscord(fail = false) {
  const calls: { method: string; url: string; body: any }[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method), url: String(url), body: init?.body });
    if (fail) return new Response('', { status: 500 });
    return new Response(JSON.stringify({ id: `m${calls.length}` }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function setup(fail = false) {
  const history = new History(':memory:');
  const fake = fakeDiscord(fail);
  const discord = new Discord(history.db, join(mkdtempSync(join(tmpdir(), 'ww-')), 'discord-webhook'), fake.fetchFn);
  discord.setUrl(HOOK);
  return { history, discord, ...fake };
}

test('nur echte Discord-Webhooks werden angenommen', () => {
  assert.ok(validWebhook(HOOK));
  assert.ok(validWebhook('https://ptb.discord.com/api/v10/webhooks/1/x'));
  assert.ok(!validWebhook('https://evil.example/api/webhooks/1/x'));
  assert.ok(!validWebhook('http://discord.com/api/webhooks/1/x'));
  assert.ok(!validWebhook('https://discord.com/api/webhooks/1/x?y=1'));
  const { discord } = setup();
  assert.throws(() => discord.setUrl('https://example.com'));
  assert.ok(discord.connected);
  discord.setUrl('');
  assert.ok(!discord.connected);
});

test('beim ersten Start wird nichts gepostet, danach jeder neue Bestwert und Kill', async () => {
  const { history, discord, calls } = setup();
  const first = history.save('c', { runs: [run(10, 12)], raids: raid(3, 100) });
  assert.deepEqual(first, { runs: [], kills: [] });
  await discord.announce('c', first, LOOK, 'Vaelric');
  assert.equal(calls.length, 0);

  const fresh = history.save('c', { runs: [run(10, 12), run(20, 14)], raids: raid(4, 200) });
  assert.deepEqual(fresh.runs.map((r) => r.key), [14]);
  assert.deepEqual(fresh.kills.map((k) => [k.difficulty, k.killed, k.total]), [['heroic', 1, 2]]);
  await discord.announce('c', fresh, LOOK, 'Vaelric');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.method === 'POST' && c.url === `${HOOK}?wait=true`));
  const embed = JSON.parse(calls[0].body).embeds[0];
  assert.equal(embed.title, 'New best run: Skyreach +14');
  assert.match(embed.description, /Timed \+2 · 25:00 \/ 30:00/);
  assert.match(embed.description, /Player stats follow/);
  assert.equal(JSON.parse(calls[1].body).embeds[0].title, 'Boss Seven killed · Heroic');
});

test('kommt das Log, wird derselbe Post um Versuche und Spielerwerte ergänzt', async () => {
  const { history, discord, calls } = setup();
  history.save('c', { runs: [], raids: raid(3, 100) });
  const killAt = Date.now() - 60_000;
  await discord.announce('c', history.save('c', { runs: [], raids: raid(4, killAt) }), LOOK, 'Vaelric');
  assert.equal(calls.length, 1);

  // Noch kein Log: nichts zu tun
  await discord.work('c', LOOK, 'Vaelric', [], async () => []);
  assert.equal(calls.length, 1);

  const report: Report = { code: 'AbCdEfGhIjKlMnOp', title: 'Raid', start: killAt - 2_000_000, end: killAt, zone: 'Raid', fights: [
    { id: 1, name: 'Boss Seven', encounterId: 7, start: 100_000, end: 400_000, kill: false, difficulty: 4, percent: 31.5, keyLevel: null, keyTime: null, keyBonus: null },
    { id: 2, name: 'Boss Seven', encounterId: 7, start: 600_000, end: 900_000, kill: false, difficulty: 4, percent: 12, keyLevel: null, keyTime: null, keyBonus: null },
    { id: 3, name: 'Boss Seven', encounterId: 7, start: 1_652_000, end: 2_000_000, kill: true, difficulty: 4, percent: 0, keyLevel: null, keyTime: null, keyBonus: null },
  ] };
  const asked: number[] = [];
  const stats = async (_code: string, fight: number) => {
    asked.push(fight);
    return [{ name: 'Vaelric', dps: 512_400, hps: 8_100, deaths: 0, interrupts: 4, parse: 93 }, { name: 'Lyssia', dps: 61_200, hps: 402_600, deaths: 1, interrupts: 0, parse: 64 }];
  };
  await discord.work('c', LOOK, 'Vaelric', [report], stats);
  assert.deepEqual(asked, [3]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].url, `${HOOK}/messages/m1`);
  const embed = JSON.parse(calls[1].body).embeds[0];
  assert.match(embed.description, /Tries 3 · Fight 5:48 · Best wipe 12 %/);
  assert.match(embed.description, /Vaelric +512k/);
  assert.match(embed.description, /Top HPS: \*\*Lyssia 403k\*\*/);
  assert.doesNotMatch(embed.description, /follow/);

  // Fertig: wird nicht nochmal bearbeitet
  await discord.work('c', LOOK, 'Vaelric', [report], stats);
  assert.equal(calls.length, 2);
});

test('ist Discord nicht erreichbar, wird der Post beim nächsten Durchlauf gesendet', async () => {
  const history = new History(':memory:');
  const dir = join(mkdtempSync(join(tmpdir(), 'ww-')), 'discord-webhook');
  const down = fakeDiscord(true);
  const discord = new Discord(history.db, dir, down.fetchFn);
  discord.setUrl(HOOK);
  history.save('c', { runs: [], raids: [] });
  await discord.announce('c', history.save('c', { runs: [run(Date.now(), 14)], raids: [] }), LOOK, 'Vaelric');
  assert.equal(down.calls.length, 1);

  const up = fakeDiscord();
  const again = new Discord(history.db, dir, up.fetchFn);
  await again.work('c', LOOK, 'Vaelric', [], async () => []);
  assert.equal(up.calls.length, 1);
  assert.equal(up.calls[0].method, 'POST');
});

test('ohne Webhook wird nichts gesendet', async () => {
  const { history, discord, calls } = setup();
  discord.setUrl('');
  history.save('c', { runs: [], raids: [] });
  await discord.announce('c', history.save('c', { runs: [run(20, 14)], raids: [] }), LOOK, 'Vaelric');
  assert.equal(calls.length, 0);
});

test('Kacheln gehen als PNG-Anhang raus', async () => {
  const { history, discord, calls } = setup();
  history.save('c', { runs: [], raids: [] });
  await discord.announce('c', history.save('c', { runs: [run(20, 14)], raids: [] }), { ...LOOK, style: 'tiles', lang: 'ru' }, 'Vaelric');
  const form = calls[0].body as FormData;
  assert.ok(form instanceof FormData);
  const payload = JSON.parse(String(form.get('payload_json')));
  assert.equal(payload.embeds[0].image.url, 'attachment://wowwatchr.png');
  const file = form.get('files[0]') as Blob;
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(1, 4)], [80, 78, 71]); // „PNG“
});

test('Log-Zuordnung: Dungeon nach Key und Zeit, Boss nach Name und Schwierigkeit', () => {
  const report: Report = { code: 'x', title: '', start: 1_000_000, end: 9_000_000, zone: '', fights: [
    { id: 5, name: 'Skyreach', encounterId: 1, start: 0, end: 1_000_000, kill: true, difficulty: 10, percent: 0, keyLevel: 14, keyTime: 1_500_000, keyBonus: 2 },
    { id: 6, name: 'Boss Eight', encounterId: 8, start: 0, end: 1_000_000, kill: true, difficulty: 4, percent: 0, keyLevel: null, keyTime: null, keyBonus: null },
  ] };
  assert.equal(findLog({ kind: 'run', run: run(2_000_000, 14) }, [report])?.fight, 5);
  assert.equal(findLog({ kind: 'run', run: run(2_000_000, 15) }, [report]), null);
  assert.equal(findLog({ kind: 'run', run: run(2_000_000 + 30 * 60_000, 14) }, [report]), null);
  const kill = (boss: string) => ({ kind: 'kill' as const, kill: { at: 2_000_000, raid: 'Raid', boss: { en_US: boss }, difficulty: 'heroic' as const, count: 1 }, killed: 1, total: 2 });
  assert.equal(findLog(kill('Boss Eight'), [report])?.fight, 6);
  assert.equal(findLog(kill('Boss Seven'), [report]), null);
});

test('alle Texte der Posts gibt es in allen vier Sprachen', () => {
  const keys = (o: object) => Object.keys(o).sort();
  for (const lang of ['de', 'ru', 'fr'] as const) assert.deepEqual(keys(TEXTS[lang]), keys(TEXTS.en), lang);
  for (const lang of ['de', 'en', 'ru', 'fr'] as const) {
    const post = buildPost({ kind: 'run', run: run(1, 14) }, null, { ...LOOK, lang }, 'Vaelric');
    assert.ok(!/undefined/.test(JSON.stringify(post.payload)), lang);
  }
});

test('ein im Kanal gelöschter Post hält die anderen nicht auf, ein Warcraft-Logs-Fehler wird später nochmal versucht', async () => {
  const history = new History(':memory:');
  const calls: { method: string; url: string }[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method), url: String(url) });
    if (init?.method === 'PATCH') return new Response('{"message":"Unknown Message"}', { status: 404 });
    return new Response(JSON.stringify({ id: `m${calls.length}` }), { status: 200 });
  }) as typeof fetch;
  const discord = new Discord(history.db, join(mkdtempSync(join(tmpdir(), 'ww-')), 'discord-webhook'), fetchFn);
  discord.setUrl(HOOK);
  const at = Date.now() - 60_000;
  history.save('c', { runs: [], raids: [] });
  await discord.announce('c', history.save('c', { runs: [run(at, 14)], raids: [] }), LOOK, 'Vaelric');
  const report: Report = { code: 'x', title: '', start: at - 1_000_000, end: at, zone: '', fights: [
    { id: 5, name: 'Skyreach', encounterId: 1, start: 0, end: 1_000_000, kill: true, difficulty: 10, percent: 0, keyLevel: 14, keyTime: 1_500_000, keyBonus: 2 },
  ] };

  // Warcraft Logs antwortet nicht: kein Bearbeiten, Post bleibt offen
  await discord.work('c', LOOK, 'Vaelric', [report], async () => { throw new Error('WCL down'); });
  assert.deepEqual(calls.map((c) => c.method), ['POST']);

  // Log da, aber der Post wurde in Discord gelöscht (404): aufgeben und den neuen Run trotzdem senden
  await discord.announce('c', history.save('c', { runs: [run(at, 14), { ...run(at + 1, 15), dungeonId: 162 }], raids: [] }), LOOK, 'Vaelric');
  await discord.work('c', LOOK, 'Vaelric', [report], async () => [{ name: 'Vaelric', dps: 1, hps: 1, deaths: 0, interrupts: 0, parse: null }]);
  assert.deepEqual(calls.map((c) => c.method), ['POST', 'POST', 'PATCH']);
  await discord.work('c', LOOK, 'Vaelric', [report], async () => []);
  assert.deepEqual(calls.map((c) => c.method), ['POST', 'POST', 'PATCH']);
});

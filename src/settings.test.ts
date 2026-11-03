import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, sanitize } from './settings.ts';

test('fällt bei ungültigen Werten auf den Standard zurück', () => {
  assert.deepEqual(sanitize(null), DEFAULTS);
  const s = sanitize({ layout: 'b', lang: 'xx', accent: 'red', interval: 'abc' });
  assert.equal(s.layout, DEFAULTS.layout);
  assert.equal(s.lang, DEFAULTS.lang);
  assert.equal(s.accent, DEFAULTS.accent);
  assert.equal(s.interval, DEFAULTS.interval);
});

test('begrenzt die Wechselzeit und die Textlänge', () => {
  assert.equal(sanitize({ interval: 1 }).interval, 3);
  assert.equal(sanitize({ interval: 999 }).interval, 120);
  assert.equal(sanitize({ name: 'x'.repeat(100) }).name.length, 40);
});

test('lässt immer mindestens eine Seite an', () => {
  const s = sanitize({ pages: { character: false, mplus: false, raid: false } });
  assert.deepEqual(s.pages, { character: true, mplus: false, raid: false });
});

test('übernimmt gültige Werte', () => {
  const s = sanitize({ layout: 'd', lang: 'ru', accent: '#112233', interval: 20, pages: { raid: false } });
  assert.equal(s.layout, 'd');
  assert.equal(s.lang, 'ru');
  assert.equal(s.accent, '#112233');
  assert.equal(s.interval, 20);
  assert.deepEqual(s.pages, { character: true, mplus: true, raid: false });
});

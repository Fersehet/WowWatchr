import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';
import { Auth } from './auth.ts';

test('ein kaputtes Cookie gilt als nicht angemeldet statt als Serverfehler', () => {
  const auth = new Auth('', 'secret', { name: 'admin', password: 'pw' });
  assert.equal(auth.user({ headers: { cookie: 'ww_session=%E0%A4%A' } } as Request), null);
});

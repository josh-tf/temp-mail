import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSession, readSession } from './session.ts';

test('session round-trips, rejects forgery, expiry and wrong secret', async () => {
  const t = await makeSession('s3cret', '123456789', 60);
  assert.deepEqual(await readSession('s3cret', t), { userId: '123456789', exp: Number(t.split('.')[1]) });
  assert.equal(await readSession('other', t), null);
  assert.equal(await readSession('s3cret', t.replace('123456789', '987654321')), null);
  assert.equal(await readSession('s3cret', t, Date.now() + 61_000), null);
  assert.equal(await readSession('s3cret', undefined), null);
  assert.equal(await readSession('s3cret', 'a.b'), null);
});

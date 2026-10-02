// Runs the real queries against the real migrations on node:sqlite via a tiny D1 shim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { deleteMessages, getMessage, listAliases, listMessages, usersExist, type User } from './db.ts';
import { parseCursor } from './validate.ts';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync('migrations').sort()) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const stmt = (sql: string, b: any[] = []): any => ({
    bind: (...nb: any[]) => stmt(sql, nb),
    all: async () => ({ results: db.prepare(sql).all(...b) }),
    first: async () => db.prepare(sql).get(...b) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...b).changes) } }),
  });
  return { raw: db, d1: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database };
}

const user = (id: string, flags: Partial<User> = {}): User => ({
  id,
  name: id,
  avatar: null,
  is_admin: 0,
  can_create: 0,
  see_all: 0,
  created_at: 0,
  last_login_at: null,
  permanent: false,
  ...flags,
});

function seed() {
  const { raw, d1: db } = d1();
  raw.exec(`INSERT INTO users (id, created_at) VALUES ('11111', 0), ('22222', 0);
    INSERT INTO aliases (address, created_at) VALUES ('a@x', 0), ('b@x', 0);
    INSERT INTO alias_access VALUES ('11111', 'a@x');`);
  const ins = raw.prepare(
    'INSERT INTO messages (id, address, from_addr, subject, received_at, size) VALUES (?, ?, ?, ?, ?, 1)',
  );
  // Five messages on a@x, three sharing a timestamp to exercise the id tiebreak.
  const ids = ['00000000-0000-0000-0000-00000000000', '10000000-0000-0000-0000-00000000000'];
  [100, 200, 200, 200, 300].forEach((t, i) => ins.run(`${ids[0]}${i}`, 'a@x', `sender${i}@y`, `subject ${i}`, t));
  ins.run(`${ids[1]}0`, 'b@x', 'secret@y', '100% off_sale', 250);
  return { raw, db };
}

test('plain user sees only granted aliases and their messages', async () => {
  const { db } = seed();
  const u = user('11111');
  assert.deepEqual(
    (await listAliases(db, u)).map((a) => a.address),
    ['a@x'],
  );
  const all = await listMessages(db, u, { limit: 50 });
  assert.equal(all.messages.length, 5);
  assert.ok(all.messages.every((m) => m.address === 'a@x'));
  assert.equal((await listMessages(db, u, { alias: 'b@x', limit: 50 })).messages.length, 0);
  assert.equal(await getMessage(db, u, '10000000-0000-0000-0000-000000000000'), null);
  assert.ok(await getMessage(db, u, '00000000-0000-0000-0000-000000000000'));
  // No access at all: nothing.
  assert.equal((await listAliases(db, user('22222'))).length, 0);
  assert.equal((await listMessages(db, user('22222'), { limit: 50 })).messages.length, 0);
});

test('see_all and admin see everything', async () => {
  const { db } = seed();
  for (const u of [user('22222', { see_all: 1 }), user('22222', { is_admin: 1 })]) {
    assert.equal((await listAliases(db, u)).length, 2);
    assert.equal((await listMessages(db, u, { limit: 50 })).messages.length, 6);
    assert.ok(await getMessage(db, u, '10000000-0000-0000-0000-000000000000'));
  }
});

test('keyset pagination walks every row once, newest first, across equal timestamps', async () => {
  const { db } = seed();
  const u = user('11111');
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await listMessages(db, u, { limit: 2, cursor: parseCursor(cursor ?? undefined) });
    seen.push(...page.messages.map((m) => m.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
  const full = (await listMessages(db, u, { limit: 50 })).messages.map((m) => m.id);
  assert.deepEqual(seen, full);
  assert.equal(full[0].at(-1), '4'); // t=300 first
});

test('search is case-insensitive and treats % and _ literally', async () => {
  const { db } = seed();
  const admin = user('22222', { is_admin: 1 });
  assert.equal((await listMessages(db, admin, { q: 'SUBJECT 3', limit: 50 })).messages.length, 1);
  assert.equal((await listMessages(db, admin, { q: 'SENDER', limit: 50 })).messages.length, 5);
  assert.equal((await listMessages(db, admin, { q: '100%', limit: 50 })).messages.length, 1);
  assert.equal((await listMessages(db, admin, { q: '%', limit: 50 })).messages.length, 1);
  assert.equal((await listMessages(db, admin, { q: 'f_s', limit: 50 })).messages.length, 1); // "off_sale"
  assert.equal((await listMessages(db, admin, { q: 't_3', limit: 50 })).messages.length, 0); // _ is not a wildcard
});

test('unread counts and read flags are per user; deleting a message cascades its reads', async () => {
  const { raw, db } = seed();
  const u = user('11111');
  raw.exec(`INSERT INTO message_reads VALUES ('11111', '00000000-0000-0000-0000-000000000000')`);
  const [a] = await listAliases(db, u);
  assert.equal(a.messageCount, 5);
  assert.equal(a.unreadCount, 4);
  assert.equal(a.lastReceivedAt, 300);
  const m = (await listMessages(db, u, { limit: 50 })).messages;
  assert.equal(m.filter((x) => x.read).length, 1);
  assert.equal((await listAliases(db, user('22222', { see_all: 1 })))[0].unreadCount, 5);
  raw.exec(`DELETE FROM messages WHERE id = '00000000-0000-0000-0000-000000000000'`);
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM message_reads').get() as any).n, 0);
});

test('deleteMessages and usersExist bind one JSON parameter, so >100 ids work (D1 caps binds at 100)', async () => {
  const { raw, db } = seed();
  const ins = raw.prepare(
    "INSERT INTO messages (id, address, from_addr, subject, received_at, size) VALUES (?, 'b@x', 'f', 's', 1, 1)",
  );
  for (let i = 0; i < 250; i++) ins.run(`20000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
  const deleted: string[] = [];
  const env = { DB: db, MAIL: { delete: async (ids: string[]) => void deleted.push(...ids) } } as unknown as Env;
  await deleteMessages(env, 'address = ?', 'b@x');
  assert.equal(deleted.length, 251);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE address = 'b@x'").get() as any).n, 0);
  assert.equal(await usersExist(db, ['11111', '22222']), true);
  assert.equal(await usersExist(db, ['11111', '33333']), false);
});

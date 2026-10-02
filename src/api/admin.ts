import { Hono, type Context } from 'hono';
import { requireAdmin, type AppEnv } from '../auth.ts';
import { adminIds, avatarUrl, usersExist, type User } from '../db.ts';
import { DISCORD_ID, bool, fail, idList, optBool, optName, readJson } from '../validate.ts';

export const admin = new Hono<AppEnv>();
admin.use('*', requireAdmin);

admin.get('/stats', async (c) => {
  const s = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM aliases) AS aliases,
            (SELECT COUNT(*) FROM messages) AS messages, (SELECT COALESCE(SUM(size), 0) FROM messages) AS storageBytes,
            (SELECT COUNT(*) FROM messages WHERE received_at > ?) AS messagesLast24h`,
  )
    .bind(Date.now() - 86400_000)
    .first();
  return c.json({ ...s, retentionDays: Number(c.env.RETENTION_DAYS) });
});

admin.get('/users', async (c) => {
  const permanent = adminIds(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT u.*, (SELECT COUNT(*) FROM alias_access x WHERE x.user_id = u.id) AS alias_count FROM users u ORDER BY u.created_at`,
  ).all<User & { alias_count: number }>();
  return c.json({
    users: results.map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: avatarUrl(u.id, u.avatar),
      isAdmin: !!u.is_admin || permanent.has(u.id),
      canCreate: !!u.can_create,
      seeAll: !!u.see_all,
      permanentAdmin: permanent.has(u.id),
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at ?? null,
      aliasCount: u.alias_count,
    })),
  });
});

/** Refuses changes that would demote a permanent admin or lock the caller out. */
function guardDemotion(c: Context<AppEnv>, id: string, isAdmin: boolean | undefined) {
  if (isAdmin !== false) return;
  if (adminIds(c.env).has(id)) fail(403, 'Permanent admins cannot be demoted');
  if (id === c.get('user').id) fail(400, 'You cannot remove your own admin rights');
}

admin.post('/users', async (c) => {
  const b = await readJson(c.req.raw);
  if (typeof b.id !== 'string' || !DISCORD_ID.test(b.id)) fail(400, 'id must be a Discord user id');
  const isAdmin = bool(b.isAdmin, 'isAdmin');
  const canCreate = bool(b.canCreate, 'canCreate');
  const seeAll = bool(b.seeAll, 'seeAll');
  const name = optName(b.name);
  guardDemotion(c, b.id, isAdmin);
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, is_admin, can_create, see_all, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = COALESCE(excluded.name, users.name), is_admin = excluded.is_admin,
       can_create = excluded.can_create, see_all = excluded.see_all`,
  )
    .bind(b.id, name ?? null, +isAdmin, +canCreate, +seeAll, Date.now())
    .run();
  return c.body(null, 201);
});

admin.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c.req.raw);
  const fields: [string, unknown][] = [];
  const name = optName(b.name);
  if (name !== undefined) fields.push(['name', name]);
  for (const [key, col] of [
    ['isAdmin', 'is_admin'],
    ['canCreate', 'can_create'],
    ['seeAll', 'see_all'],
  ] as const) {
    const v = optBool(b[key], key);
    if (v !== undefined) fields.push([col, +v]);
  }
  if (!fields.length) fail(400, 'Nothing to change');
  guardDemotion(c, id, optBool(b.isAdmin, 'isAdmin'));
  const r = await c.env.DB.prepare(`UPDATE users SET ${fields.map(([col]) => `${col} = ?`).join(', ')} WHERE id = ?`)
    .bind(...fields.map(([, v]) => v), id)
    .run();
  if (!r.meta.changes) fail(404, 'No such user');
  return c.body(null, 204);
});

admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  if (adminIds(c.env).has(id)) fail(403, 'Permanent admins cannot be removed');
  if (id === c.get('user').id) fail(400, 'You cannot remove yourself');
  const r = await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (!r.meta.changes) fail(404, 'No such user');
  return c.body(null, 204);
});

admin.get('/aliases', async (c) => {
  const [{ results: aliases }, { results: access }] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT a.address, a.created_by, u.name AS created_by_name, a.created_at,
              (SELECT COUNT(*) FROM messages m WHERE m.address = a.address) AS n
       FROM aliases a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.address`,
    ),
    c.env.DB.prepare(
      'SELECT x.address, u.id, u.name FROM alias_access x JOIN users u ON u.id = x.user_id ORDER BY u.name',
    ),
  ]);
  const users = new Map<unknown, { id: string; name: string | null }[]>();
  for (const x of access) {
    const list = users.get(x.address) ?? [];
    list.push({ id: x.id as string, name: x.name as string | null });
    users.set(x.address, list);
  }
  return c.json({
    aliases: aliases.map((a) => ({
      address: a.address,
      createdBy: a.created_by,
      createdByName: a.created_by_name ?? null,
      createdAt: a.created_at,
      messageCount: a.n,
      users: users.get(a.address) ?? [],
    })),
  });
});

admin.put('/aliases/:address/access', async (c) => {
  const address = c.req.param('address');
  const userIds = idList((await readJson(c.req.raw)).userIds, 'userIds');
  if (!(await c.env.DB.prepare('SELECT 1 FROM aliases WHERE address = ?').bind(address).first()))
    fail(404, 'No such alias');
  if (!(await usersExist(c.env.DB, userIds))) fail(400, 'userIds contains an unknown user');
  const ins = c.env.DB.prepare('INSERT INTO alias_access (user_id, address) VALUES (?, ?)');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM alias_access WHERE address = ?').bind(address),
    ...userIds.map((id) => ins.bind(id, address)),
  ]);
  return c.body(null, 204);
});

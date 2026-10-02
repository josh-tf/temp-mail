import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { canCreate, canDeleteAlias, deleteMessages, listAliases, usersExist, visible } from '../db.ts';
import { LOCAL_PART, fail, idList, readJson } from '../validate.ts';

export const aliases = new Hono<AppEnv>();

// Role mailboxes: CAs accept admin@/postmaster@/... as proof of domain control (CA/B BR 3.2.2.4.4),
// and abuse@/postmaster@ receive complaint and bounce traffic. Only admins may claim them.
const RESERVED = new Set([
  'admin',
  'administrator',
  'webmaster',
  'hostmaster',
  'postmaster',
  'abuse',
  'root',
  'security',
  'noreply',
  'no-reply',
  'ssl-admin',
]);

aliases.get('/', async (c) => c.json({ aliases: await listAliases(c.env.DB, c.get('user')) }));

function randomLocal() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

aliases.post('/', async (c) => {
  const u = c.get('user');
  if (!canCreate(u)) fail(403, 'You cannot create aliases');
  const body = await readJson(c.req.raw);
  if (body.local !== undefined && typeof body.local !== 'string') fail(400, 'local must be a string');
  const custom = ((body.local as string | undefined) ?? '').trim().toLowerCase();
  if (custom && !LOCAL_PART.test(custom)) fail(400, 'Use letters, digits, dots, dashes and underscores (max 64)');
  if (RESERVED.has(custom) && !u.is_admin) fail(403, 'That address is reserved');
  const grantTo = body.grantTo === undefined ? [] : idList(body.grantTo, 'grantTo');
  if (grantTo.length && !u.is_admin) fail(403, 'Only admins can grant access');
  if (!(await usersExist(c.env.DB, grantTo))) fail(400, 'grantTo contains an unknown user');

  // Alias + creator access + grants in one transaction; a taken address fails the
  // whole batch on the primary key. Random names retry on the (unlikely) collision.
  for (let attempt = 0; attempt < (custom ? 1 : 5); attempt++) {
    const address = `${custom || randomLocal()}@${c.env.DOMAIN}`;
    const grant = c.env.DB.prepare('INSERT OR IGNORE INTO alias_access (user_id, address) VALUES (?, ?)');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO aliases (address, created_by, created_at) VALUES (?, ?, ?)').bind(
          address,
          u.id,
          Date.now(),
        ),
        ...[u.id, ...grantTo].map((id) => grant.bind(id, address)),
      ]);
      return c.json({ address }, 201);
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e;
    }
  }
  fail(409, custom ? `${custom}@${c.env.DOMAIN} is already taken` : 'Could not pick a free address, try again');
});

aliases.delete('/:address', async (c) => {
  const u = c.get('user');
  const address = c.req.param('address');
  const [vis, vb] = visible(u, 'a.address');
  const alias = await c.env.DB.prepare(`SELECT a.created_by, ${vis} AS vis FROM aliases a WHERE a.address = ?`)
    .bind(...vb, address)
    .first<{ created_by: string | null; vis: number }>();
  if (!alias || (!alias.vis && alias.created_by !== u.id)) fail(404, 'No such alias');
  if (!canDeleteAlias(u, alias.created_by)) fail(403, 'You cannot delete this alias');
  await deleteMessages(c.env, 'address = ?', address);
  await c.env.DB.prepare('DELETE FROM aliases WHERE address = ?').bind(address).run();
  return c.body(null, 204);
});

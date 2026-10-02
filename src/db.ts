// Data access and the authorisation rules for aliases/messages. Alias and single-message reads go
// through `visible()`; listMessages inlines the same rule as an IN (...) for its query plan.
import { encodeCursor, likePattern } from './validate.ts';

export type User = {
  id: string;
  name: string | null;
  avatar: string | null;
  is_admin: number;
  can_create: number;
  see_all: number;
  created_at: number;
  last_login_at: number | null;
  /** Unix seconds; sessions issued before this are revoked (set on logout). */
  sessions_after: number | null;
  /** In ADMIN_IDS: always admin, cannot be demoted or removed. */
  permanent: boolean;
};

export type MessageRow = {
  id: string;
  address: string;
  from_addr: string;
  subject: string;
  preview: string | null;
  received_at: number;
  size: number;
};

export const adminIds = (env: { ADMIN_IDS: string }) =>
  new Set(
    env.ADMIN_IDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const seesAll = (u: User) => !!(u.is_admin || u.see_all);
export const canCreate = (u: User) => !!(u.is_admin || u.can_create);
/** Admins delete any alias; creators delete their own while they still hold can_create. */
export const canDeleteAlias = (u: User, createdBy: string | null) =>
  !!u.is_admin || (canCreate(u) && createdBy === u.id);

export const avatarUrl = (id: string, hash: string | null) =>
  hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128` : null;

/** SQL predicate (+ binds) true when the alias in column `col` is visible to `u`. `col` is always a code constant. */
export function visible(u: User, col: string): [string, unknown[]] {
  return seesAll(u)
    ? ['1', []]
    : [`EXISTS (SELECT 1 FROM alias_access x WHERE x.address = ${col} AND x.user_id = ?)`, [u.id]];
}

export async function loadUser(db: D1Database, admins: Set<string>, id: string): Promise<User | null> {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  if (!u) return null;
  u.permanent = admins.has(id);
  if (u.permanent) u.is_admin = 1;
  return u;
}

export async function listAliases(db: D1Database, u: User) {
  const [vis, vb] = visible(u, 'a.address');
  // Read counts are aggregated once per user, not probed per message.
  const { results } = await db
    .prepare(
      `SELECT a.address, a.created_by, a.created_at,
              (SELECT COUNT(*) FROM messages m WHERE m.address = a.address) AS n,
              (SELECT MAX(received_at) FROM messages m WHERE m.address = a.address) AS last,
              COALESCE(rc.c, 0) AS read_n
       FROM aliases a
       LEFT JOIN (SELECT m.address, COUNT(*) AS c FROM message_reads r JOIN messages m ON m.id = r.message_id
                  WHERE r.user_id = ? GROUP BY m.address) rc ON rc.address = a.address
       WHERE ${vis}
       ORDER BY a.address`,
    )
    .bind(u.id, ...vb)
    .all<{
      address: string;
      created_by: string | null;
      created_at: number;
      n: number;
      read_n: number;
      last: number | null;
    }>();
  return results.map((a) => ({
    address: a.address,
    createdBy: a.created_by,
    createdAt: a.created_at,
    messageCount: a.n,
    unreadCount: a.n - a.read_n,
    lastReceivedAt: a.last ?? null,
  }));
}

export async function listMessages(
  db: D1Database,
  u: User,
  opts: { alias?: string; q?: string; cursor?: [number, string] | null; limit: number },
) {
  // IN (granted aliases) lets SQLite search per alias instead of scanning all mail in time order.
  const where = seesAll(u) ? ['1'] : ['m.address IN (SELECT address FROM alias_access WHERE user_id = ?)'];
  const binds: unknown[] = seesAll(u) ? [u.id] : [u.id, u.id];
  if (opts.alias) {
    where.push('m.address = ?');
    binds.push(opts.alias);
  }
  if (opts.q) {
    const like = likePattern(opts.q);
    where.push(`(m.subject LIKE ? ESCAPE '\\' OR m.from_addr LIKE ? ESCAPE '\\')`);
    binds.push(like, like);
  }
  if (opts.cursor) {
    where.push('(m.received_at, m.id) < (?, ?)');
    binds.push(...opts.cursor);
  }
  const { results } = await db
    .prepare(
      `SELECT m.id, m.address, m.from_addr, m.subject, m.preview, m.received_at, m.size, r.message_id IS NOT NULL AS is_read
       FROM messages m
       LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ?
       WHERE ${where.join(' AND ')}
       ORDER BY m.received_at DESC, m.id DESC LIMIT ?`,
    )
    .bind(...binds, opts.limit + 1)
    .all<MessageRow & { is_read: number }>();
  const page = results.slice(0, opts.limit);
  const last = page.at(-1);
  return {
    messages: page.map((m) => ({
      id: m.id,
      address: m.address,
      from: m.from_addr,
      subject: m.subject,
      preview: m.preview ?? null,
      receivedAt: m.received_at,
      size: m.size,
      read: !!m.is_read,
    })),
    nextCursor: results.length > opts.limit && last ? encodeCursor(last.received_at, last.id) : null,
  };
}

/** The message row if it exists and `u` may see it; otherwise null (callers answer 404 either way). */
export function getMessage(db: D1Database, u: User, id: string) {
  const [vis, vb] = visible(u, 'm.address');
  return db
    .prepare(`SELECT m.* FROM messages m WHERE m.id = ? AND ${vis}`)
    .bind(id, ...vb)
    .first<MessageRow>();
}

/** Deletes messages (rows and their R2 objects) matching a WHERE clause, in batches. */
export async function deleteMessages(env: Env, where: string, ...binds: unknown[]) {
  for (;;) {
    const { results } = await env.DB.prepare(`SELECT id FROM messages WHERE ${where} LIMIT 500`)
      .bind(...binds)
      .all<{ id: string }>();
    if (!results.length) return;
    const ids = results.map((r) => r.id);
    // One JSON bind (D1 caps a query at 100 bound parameters). Rows go first, so a
    // failure can only orphan R2 objects, never leave a row without its body.
    await env.DB.prepare('DELETE FROM messages WHERE id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(ids))
      .run();
    await env.MAIL.delete(ids);
  }
}

/** True if every id is a known user. */
export async function usersExist(db: D1Database, ids: string[]) {
  if (!ids.length) return true;
  const r = await db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(ids))
    .first<{ n: number }>();
  return r?.n === ids.length;
}

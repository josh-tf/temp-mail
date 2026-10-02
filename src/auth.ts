import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { adminIds, loadUser, type User } from './db.ts';
import { makeSession, readSession } from './session.ts';
import { DISCORD_ID, fail } from './validate.ts';

export type AppEnv = { Bindings: Env; Variables: { user: User } };

const SESSION_TTL = 30 * 86400;
// Both cookies are __Host- prefixed: Secure, Path=/, no Domain.
const cookieOpts = { prefix: 'host', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' } as const;

/** Every state-changing request must come from our own origin (Origin, else Sec-Fetch-Site). */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    const ok = origin ? origin === new URL(c.req.url).origin : c.req.header('sec-fetch-site') === 'same-origin';
    if (!ok) fail(403, 'Cross-origin request refused');
  }
  await next();
};

/** Loads the session user, re-checked against the users table on every request. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await readSession(c.env.SESSION_SECRET, getCookie(c, 's', 'host'));
  const user = s ? await loadUser(c.env.DB, adminIds(c.env), s.userId) : null;
  // Sessions issued before the user's last logout are revoked.
  if (!user || s!.exp - SESSION_TTL < (user.sessions_after ?? 0)) fail(401, 'Not signed in');
  c.set('user', user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user').is_admin) fail(403, 'Admins only');
  await next();
};

/** Revokes every session of the user (all devices), clears the cookie and the browser's cached mail. */
export const logout = async (c: Context<AppEnv>) => {
  const s = await readSession(c.env.SESSION_SECRET, getCookie(c, 's', 'host'));
  // Second precision: a session issued in this same second would survive; it would need a fresh login anyway.
  if (s) await c.env.DB.prepare('UPDATE users SET sessions_after = unixepoch() WHERE id = ?').bind(s.userId).run();
  deleteCookie(c, 's', cookieOpts);
  c.header('clear-site-data', '"cache"');
  return c.body(null, 204);
};

export const auth = new Hono<AppEnv>();

auth.get('/login', (c) => {
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, { ...cookieOpts, maxAge: 600 });
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: `${new URL(c.req.url).origin}/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
  }).toString();
  return c.redirect(url.toString(), 302);
});

auth.get('/callback', async (c) => {
  const back = (error: string, extra = '') => c.redirect(`/login?error=${error}${extra}`, 302);
  const expected = getCookie(c, 'oauth_state', 'host');
  deleteCookie(c, 'oauth_state', cookieOpts);
  const { code, state, error } = c.req.query();
  if (error) return back('cancelled');
  if (!code || !state || !expected || state !== expected) return back('state');

  const origin = new URL(c.req.url).origin;
  const tok = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID,
      client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin}/callback`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tok.ok) return back('discord');
  const { access_token } = await tok.json<{ access_token: string }>();
  const me = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!me.ok) return back('discord');
  const p = await me.json<{ id: string; username: string; global_name: string | null; avatar: string | null }>();
  if (!DISCORD_ID.test(p.id)) return back('discord');
  const name = (p.global_name || p.username || '').slice(0, 100) || null;
  const avatar = p.avatar && /^(a_)?[0-9a-f]{32}$/.test(p.avatar) ? p.avatar : null;
  const now = Date.now();

  if (adminIds(c.env).has(p.id)) {
    await c.env.DB.prepare(
      `INSERT INTO users (id, name, avatar, is_admin, created_at, last_login_at) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, last_login_at = excluded.last_login_at`,
    )
      .bind(p.id, name, avatar, now, now)
      .run();
  } else {
    const r = await c.env.DB.prepare('UPDATE users SET name = ?, avatar = ?, last_login_at = ? WHERE id = ?')
      .bind(name, avatar, now, p.id)
      .run();
    if (!r.meta.changes) return back('unauthorised', `&id=${p.id}`);
  }
  setCookie(c, 's', await makeSession(c.env.SESSION_SECRET, p.id, SESSION_TTL), { ...cookieOpts, maxAge: SESSION_TTL });
  return c.redirect('/', 302);
});

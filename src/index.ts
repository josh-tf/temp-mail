// Worker entry: JSON API + Discord OAuth (Hono), catch-all mail intake, retention cron.
// Everything outside /api/* and /auth/* is the SPA, served by Workers Static Assets.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { admin } from './api/admin.ts';
import { aliases } from './api/aliases.ts';
import { messages } from './api/messages.ts';
import { auth, logout, requireUser, sameOrigin, type AppEnv } from './auth.ts';
import { avatarUrl, canCreate, deleteMessages, seesAll } from './db.ts';
import { receive } from './mail.ts';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'same-origin');
  h.set('strict-transport-security', 'max-age=63072000; includeSubDomains');
  h.set('cross-origin-resource-policy', 'same-origin');
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  if (!h.has('content-security-policy'))
    h.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
});
app.use('*', sameOrigin);

app.route('/auth', auth);
// Discord's registered redirect URI is /callback (from the first version); keep it.
app.get('/callback', (c) => c.redirect('/auth/callback' + new URL(c.req.url).search, 302));

const api = new Hono<AppEnv>();
api.use('*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));
api.post('/auth/logout', logout);
api.use('*', requireUser);
api.get('/me', (c) => {
  const u = c.get('user');
  return c.json({
    id: u.id,
    name: u.name,
    avatarUrl: avatarUrl(u.id, u.avatar),
    isAdmin: !!u.is_admin,
    canCreate: canCreate(u),
    seeAll: seesAll(u),
    domain: c.env.DOMAIN,
  });
});
api.route('/aliases', aliases);
api.route('/messages', messages);
api.route('/admin', admin);
app.route('/api', api);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default {
  fetch: app.fetch,
  email: receive,
  async scheduled(_event, env) {
    await deleteMessages(env, 'received_at < ?', Date.now() - Number(env.RETENTION_DAYS) * 86400_000);
  },
} satisfies ExportedHandler<Env>;

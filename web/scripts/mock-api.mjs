// In-memory stand-in for the Worker's /api, for UI work and screenshots without
// wrangler. Not shipped. `node scripts/mock-api.mjs` (PORT, default 8799), then
// `API_ORIGIN=http://127.0.0.1:8799 pnpm dev` (or `pnpm preview`).
// A `mock=anon` cookie makes /api/me return 401; `mock=member` drops admin.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8799);
const DOMAIN = 'example.com';
const now = Date.now();
const min = 60_000;

const users = [
  {
    id: '100000000000000001',
    name: 'Admin',
    avatar: null,
    isAdmin: true,
    canCreate: true,
    seeAll: true,
    permanentAdmin: true,
    createdAt: now - 90 * 86400e3,
    lastLoginAt: now - 2 * min,
  },
  {
    id: '402938475610293847',
    name: 'Alex Rivera',
    avatar: null,
    isAdmin: false,
    canCreate: true,
    seeAll: false,
    permanentAdmin: false,
    createdAt: now - 30 * 86400e3,
    lastLoginAt: now - 5 * 3600e3,
  },
  {
    id: '118273645501928374',
    name: 'Sam',
    avatar: null,
    isAdmin: false,
    canCreate: false,
    seeAll: true,
    permanentAdmin: false,
    createdAt: now - 12 * 86400e3,
    lastLoginAt: null,
  },
];
const aliases = [
  { address: `signup@${DOMAIN}`, createdBy: users[0].id, createdAt: now - 20 * 86400e3, access: [users[0].id] },
  {
    address: `newsletters@${DOMAIN}`,
    createdBy: users[0].id,
    createdAt: now - 10 * 86400e3,
    access: [users[0].id, users[1].id],
  },
  { address: `k3j9x2mq7a@${DOMAIN}`, createdBy: users[1].id, createdAt: now - 3 * 86400e3, access: [users[1].id] },
];
const html = (title, body) =>
  `<!doctype html><html><head><base target="_blank"></head><body style="font-family:Arial,sans-serif;margin:0;padding:24px;background:#f4f4f5"><div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:32px"><h1 style="margin-top:0;font-size:22px;color:#111">${title}</h1>${body}<p><a href="https://example.com" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open link</a></p><script>document.body.innerHTML='script ran!'</script></div></body></html>`;
const messages = [
  [
    'signup@',
    'GitHub <noreply@github.com>',
    '[GitHub] Please verify your device',
    'Hey there! A sign in attempt requires further verification because we did not recognize your device. Verification code: 482913',
    3 * min,
    true,
    1,
  ],
  [
    'newsletters@',
    'The Pragmatic Engineer <hello@pragmaticengineer.com>',
    'The scaling playbook nobody talks about',
    'This week: how three teams scaled their on-call rotation without burning out, and a deep dive into database migrations at scale.',
    42 * min,
    true,
    0,
  ],
  [
    'signup@',
    'Stripe <support@stripe.com>',
    'Confirm your email address',
    'Thanks for signing up for Stripe! Please confirm your email address by clicking the link below.',
    5 * 3600e3,
    false,
    0,
  ],
  [
    'k3j9x2mq7a@',
    'noreply@accounts.example.org',
    'Your one-time passcode',
    'Your passcode is 771204. It expires in 10 minutes. If you did not request this, ignore this email.',
    26 * 3600e3,
    false,
    0,
  ],
  [
    'newsletters@',
    'Hacker Newsletter <kale@hackernewsletter.com>',
    'Hacker Newsletter #712',
    'Fresh from the front page: a weekend project that became a company, why SQLite is everywhere, and more.',
    3 * 86400e3,
    false,
    2,
  ],
  [
    'signup@',
    'Discord <noreply@discord.com>',
    '',
    'Verify your email to finish creating your Discord account.',
    6 * 86400e3,
    false,
    0,
  ],
].map(([to, from, subject, text, ago, htmlBody, att], i) => ({
  id: randomUUID(),
  address: to + DOMAIN,
  from,
  subject,
  preview: text.slice(0, 200),
  text,
  hasHtml: htmlBody,
  receivedAt: now - ago,
  size: 2000 + i * 3137,
  attachments: Array.from({ length: att }, (_, j) => ({
    index: j,
    filename: j ? 'report.pdf' : 'invoice-2026-09.pdf',
    size: 48213 * (j + 1),
    contentType: 'application/pdf',
  })),
  readBy: new Set(i > 1 ? [users[0].id, users[1].id] : []),
}));
for (let i = 0; i < 60; i++)
  messages.push({
    id: randomUUID(),
    address: `newsletters@${DOMAIN}`,
    from: `Digest ${i} <digest@example.com>`,
    subject: `Weekly digest #${100 - i}`,
    preview: 'Older mail for pagination.',
    text: 'Older mail.',
    hasHtml: false,
    receivedAt: now - (7 + i) * 86400e3,
    size: 1500,
    attachments: [],
    readBy: new Set([users[0].id]),
  });

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const empty = (res, status = 204) => (res.writeHead(status, { 'cache-control': 'no-store' }), res.end());
const readBody = (req) =>
  new Promise((r) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => r(s ? JSON.parse(s) : {}));
  });
const avatarUrl = () => null;
const visible = (me) => aliases.filter((a) => me.isAdmin || me.seeAll || a.access.includes(me.id));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const cookie = req.headers.cookie ?? '';
  if (p === '/auth/login')
    return (res.writeHead(302, { location: '/login?error=unauthorised&id=402938475610293999' }), res.end());
  if (/mock=anon/.test(cookie)) return json(res, 401, { error: 'Not signed in' });
  const me = /mock=member/.test(cookie) ? users[1] : users[0];
  const mine = visible(me);
  const canSee = (addr) => mine.some((a) => a.address === addr);
  const method = req.method;
  let m;

  if (method !== 'GET' && req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')
    return json(res, 403, { error: 'Cross-origin request' });

  if (p === '/api/me')
    return json(res, 200, {
      id: me.id,
      name: me.name,
      avatarUrl: avatarUrl(me),
      isAdmin: me.isAdmin,
      canCreate: me.canCreate,
      seeAll: me.seeAll,
      domain: DOMAIN,
    });
  if (p === '/api/auth/logout') return empty(res);
  if (p === '/api/aliases' && method === 'GET')
    return json(res, 200, {
      aliases: mine.map((a) => {
        const ms = messages.filter((x) => x.address === a.address);
        return {
          address: a.address,
          createdBy: a.createdBy,
          createdAt: a.createdAt,
          messageCount: ms.length,
          unreadCount: ms.filter((x) => !x.readBy.has(me.id)).length,
          lastReceivedAt: ms[0]?.receivedAt ?? null,
        };
      }),
    });
  if (p === '/api/aliases' && method === 'POST') {
    const b = await readBody(req);
    const address = `${b.local || Math.random().toString(36).slice(2, 12)}@${DOMAIN}`;
    if (aliases.some((a) => a.address === address)) return json(res, 409, { error: 'Address already taken' });
    aliases.push({ address, createdBy: me.id, createdAt: Date.now(), access: [me.id, ...(b.grantTo ?? [])] });
    return json(res, 201, { address });
  }
  if ((m = /^\/api\/aliases\/([^/]+)$/.exec(p)) && method === 'DELETE') {
    const i = aliases.findIndex((a) => a.address === decodeURIComponent(m[1]));
    if (i < 0) return json(res, 404, { error: 'Not found' });
    aliases.splice(i, 1);
    return empty(res);
  }
  if (p === '/api/messages') {
    const alias = url.searchParams.get('alias');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const cursor = Number(url.searchParams.get('cursor') ?? 0);
    if (alias && !canSee(alias)) return json(res, 404, { error: 'Alias not found' });
    const all = messages.filter(
      (x) =>
        canSee(x.address) && (!alias || x.address === alias) && (!q || (x.subject + x.from).toLowerCase().includes(q)),
    );
    const page = all.slice(cursor, cursor + limit);
    return json(res, 200, {
      messages: page.map((x) => ({
        id: x.id,
        address: x.address,
        from: x.from,
        subject: x.subject,
        preview: x.preview,
        receivedAt: x.receivedAt,
        size: x.size,
        read: x.readBy.has(me.id),
      })),
      nextCursor: cursor + limit < all.length ? String(cursor + limit) : null,
    });
  }
  if ((m = /^\/api\/messages\/([^/]+)(?:\/(read|body|raw|attachments\/\d+))?$/.exec(p))) {
    const msg = messages.find((x) => x.id === m[1] && canSee(x.address));
    if (!msg) return json(res, 404, { error: 'Message not found' });
    const sub = m[2];
    if (!sub && method === 'GET') {
      msg.readBy.add(me.id);
      return json(res, 200, {
        id: msg.id,
        address: msg.address,
        from: msg.from,
        to: msg.address,
        subject: msg.subject,
        receivedAt: msg.receivedAt,
        size: msg.size,
        text: msg.text,
        hasHtml: msg.hasHtml,
        attachments: msg.attachments,
      });
    }
    if (!sub && method === 'DELETE') return (messages.splice(messages.indexOf(msg), 1), empty(res));
    if (sub === 'read') {
      const b = await readBody(req);
      b.read ? msg.readBy.add(me.id) : msg.readBy.delete(me.id);
      return empty(res);
    }
    if (sub === 'body') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
      });
      return res.end(html(msg.subject, `<p style="color:#333;line-height:1.6">${msg.text}</p>`));
    }
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="message.eml"',
    });
    return res.end(`From: ${msg.from}\r\nSubject: ${msg.subject}\r\n\r\n${msg.text}`);
  }
  if (p.startsWith('/api/admin') && !me.isAdmin) return json(res, 403, { error: 'Admins only' });
  if (p === '/api/admin/stats')
    return json(res, 200, {
      users: users.length,
      aliases: aliases.length,
      messages: messages.length,
      storageBytes: messages.reduce((n, x) => n + x.size, 0),
      messagesLast24h: messages.filter((x) => x.receivedAt > now - 86400e3).length,
      retentionDays: 30,
    });
  if (p === '/api/admin/users' && method === 'GET')
    return json(res, 200, {
      users: users.map(({ avatar, ...u }) => ({
        ...u,
        avatarUrl: avatar,
        aliasCount: aliases.filter((a) => a.createdBy === u.id).length,
      })),
    });
  if (p === '/api/admin/users' && method === 'POST') {
    const b = await readBody(req);
    if (!/^\d{5,25}$/.test(b.id ?? '')) return json(res, 400, { error: 'Invalid Discord ID' });
    users.push({
      id: b.id,
      name: b.name ?? null,
      avatar: null,
      isAdmin: !!b.isAdmin,
      canCreate: !!b.canCreate,
      seeAll: !!b.seeAll,
      permanentAdmin: false,
      createdAt: Date.now(),
      lastLoginAt: null,
    });
    return empty(res, 201);
  }
  if ((m = /^\/api\/admin\/users\/(\d+)$/.exec(p))) {
    const u = users.find((x) => x.id === m[1]);
    if (!u) return json(res, 404, { error: 'User not found' });
    if (method === 'DELETE') return (users.splice(users.indexOf(u), 1), empty(res));
    Object.assign(u, await readBody(req));
    return empty(res);
  }
  if (p === '/api/admin/aliases')
    return json(res, 200, {
      aliases: aliases.map((a) => ({
        address: a.address,
        createdBy: a.createdBy,
        createdByName: users.find((u) => u.id === a.createdBy)?.name ?? null,
        createdAt: a.createdAt,
        messageCount: messages.filter((x) => x.address === a.address).length,
        users: a.access.map((id) => ({ id, name: users.find((u) => u.id === id)?.name ?? null })),
      })),
    });
  if ((m = /^\/api\/admin\/aliases\/([^/]+)\/access$/.exec(p))) {
    const a = aliases.find((x) => x.address === decodeURIComponent(m[1]));
    if (!a) return json(res, 404, { error: 'Not found' });
    a.access = (await readBody(req)).userIds;
    return empty(res);
  }
  json(res, 404, { error: 'Not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`mock api on http://127.0.0.1:${PORT}`));

import { Hono, type Context } from 'hono';
import PostalMime from 'postal-mime';
import type { AppEnv } from '../auth.ts';
import { deleteMessages, getMessage, listMessages } from '../db.ts';
import { MESSAGE_ID, bool, fail, parseCursor, parseLimit, readJson } from '../validate.ts';

// Mail HTML renders as an opaque origin (sandbox), runs no script and fetches
// nothing remote — remote images are tracking pixels as often as not.
const MAIL_CSP =
  "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'";

export const messages = new Hono<AppEnv>();

messages.get('/', async (c) => {
  const { alias, q, cursor, limit } = c.req.query();
  if (q && q.length > 200) fail(400, 'Search is too long');
  return c.json(
    await listMessages(c.env.DB, c.get('user'), {
      alias: alias || undefined,
      q: q?.trim() || undefined,
      cursor: parseCursor(cursor),
      limit: parseLimit(limit),
    }),
  );
});

/** The visible message row for :id, or 404. */
async function row(c: Context<AppEnv>) {
  const id = c.req.param('id') ?? '';
  const msg = MESSAGE_ID.test(id) ? await getMessage(c.env.DB, c.get('user'), id) : null;
  if (!msg) fail(404, 'No such message');
  return msg;
}

async function raw(c: Context<AppEnv>, id: string) {
  const obj = await c.env.MAIL.get(id);
  if (!obj) fail(404, 'Message content is missing');
  return obj;
}

async function parsed(c: Context<AppEnv>) {
  const msg = await row(c);
  return { msg, mail: await PostalMime.parse(await (await raw(c, msg.id)).arrayBuffer()) };
}

// A message id's content never changes: let the browser keep it (logout sends Clear-Site-Data: "cache").
const IMMUTABLE = 'private, max-age=86400, immutable';

// Downloads are always octet-stream attachments so nothing renders in the app's origin.
const download = (body: BodyInit, filename: string) =>
  new Response(body, {
    headers: {
      'cache-control': IMMUTABLE,
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });

const markRead = (c: Context<AppEnv>, id: string) =>
  c.env.DB.prepare('INSERT OR IGNORE INTO message_reads (user_id, message_id) VALUES (?, ?)')
    .bind(c.get('user').id, id)
    .run();

messages.get('/:id', async (c) => {
  const { msg, mail } = await parsed(c);
  await markRead(c, msg.id);
  return c.json({
    id: msg.id,
    address: msg.address,
    from: msg.from_addr,
    to:
      mail.to
        ?.map((a) => a.address)
        .filter(Boolean)
        .join(', ') || msg.address,
    subject: msg.subject,
    receivedAt: msg.received_at,
    size: msg.size,
    text: mail.text ?? '',
    hasHtml: !!mail.html,
    attachments: mail.attachments.map((a, index) => ({
      index,
      filename: a.filename || `attachment-${index}`,
      size: typeof a.content === 'string' ? a.content.length : a.content.byteLength,
      contentType: a.mimeType,
    })),
  });
});

messages.post('/:id/read', async (c) => {
  const msg = await row(c);
  const read = bool((await readJson(c.req.raw)).read, 'read');
  if (read) await markRead(c, msg.id);
  else
    await c.env.DB.prepare('DELETE FROM message_reads WHERE user_id = ? AND message_id = ?')
      .bind(c.get('user').id, msg.id)
      .run();
  return c.body(null, 204);
});

messages.delete('/:id', async (c) => {
  const msg = await row(c);
  await deleteMessages(c.env, 'id = ?', msg.id);
  return c.body(null, 204);
});

messages.get('/:id/body', async (c) => {
  const { mail } = await parsed(c);
  return new Response(`<!doctype html><meta charset="utf-8"><base target="_blank">${mail.html ?? ''}`, {
    headers: {
      'cache-control': IMMUTABLE,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': MAIL_CSP,
    },
  });
});

messages.get('/:id/raw', async (c) => {
  const msg = await row(c);
  return download((await raw(c, msg.id)).body, `${msg.id}.eml`);
});

messages.get('/:id/attachments/:index', async (c) => {
  const index = c.req.param('index');
  if (!/^\d{1,4}$/.test(index)) fail(404, 'No such attachment');
  const { mail } = await parsed(c);
  const att = mail.attachments[Number(index)];
  if (!att) fail(404, 'No such attachment');
  return download(att.content as BodyInit, att.filename || `attachment-${index}`);
});

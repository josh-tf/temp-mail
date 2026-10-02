import PostalMime from 'postal-mime';

// Email Routing itself caps at 25 MiB; refuse earlier so a parse never nears the Worker's memory limit.
const MAX_BYTES = 20 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** First ~200 chars of readable text, from the text part or else the HTML with tags stripped. */
export function makePreview(text: string | undefined, html: string | undefined): string {
  const src =
    text ||
    (html ?? '')
      .slice(0, 100_000) // bounds the regex work on huge HTML bodies
      .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<\/?(p|br|div|tr|td|th|li|h\d|table|ul|ol|blockquote|hr)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      });
  return src.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export async function receive(message: ForwardableEmailMessage, env: Env) {
  const to = message.to.toLowerCase();
  const at = to.lastIndexOf('@');
  // Plus-addressing lands in the base alias: foo+github@ -> foo@
  const address = `${to.slice(0, at).split('+')[0]}@${to.slice(at + 1)}`;
  if (!(await env.DB.prepare('SELECT 1 FROM aliases WHERE address = ?').bind(address).first())) {
    message.setReject('No such mailbox');
    return;
  }
  if (message.rawSize > MAX_BYTES) {
    message.setReject('Message too large');
    return;
  }
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const id = crypto.randomUUID();
  const from = parsed.from?.address
    ? parsed.from.name
      ? `${parsed.from.name} <${parsed.from.address}>`
      : parsed.from.address
    : message.from;
  await env.MAIL.put(id, raw);
  try {
    await env.DB.prepare(
      'INSERT INTO messages (id, address, from_addr, subject, received_at, size, preview) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        address,
        from.slice(0, 512),
        (parsed.subject ?? '').slice(0, 998),
        Date.now(),
        raw.byteLength,
        makePreview(parsed.text, parsed.html),
      )
      .run();
  } catch (e) {
    await env.MAIL.delete(id); // no orphaned object if the row could not be written
    throw e;
  }
}

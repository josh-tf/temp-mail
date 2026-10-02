// Stateless session cookie: "<discordId>.<expiresAtSeconds>.<hmac>".
// Revocation is handled by the caller re-checking the users table per request,
// so deleting a user logs them out without a session store; users.sessions_after
// (set on logout) revokes every token issued before it.

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const key = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

async function sign(secret: string, payload: string) {
  return b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
}

export async function makeSession(secret: string, userId: string, ttlSeconds: number, now = Date.now()) {
  const payload = `${userId}.${Math.floor(now / 1000) + ttlSeconds}`;
  return `${payload}.${await sign(secret, payload)}`;
}

/** Returns the user id and expiry (seconds), or null if the token is malformed, forged or expired. */
export async function readSession(secret: string, token: string | undefined, now = Date.now()) {
  const parts = token?.split('.');
  if (!parts || parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!/^\d+$/.test(userId) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) * 1000 < now) return null;
  const expected = await sign(secret, `${userId}.${exp}`);
  // Constant-time compare: both are fixed-length base64url HMACs.
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { userId, exp: Number(exp) } : null;
}

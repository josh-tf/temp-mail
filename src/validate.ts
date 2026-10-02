import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const DISCORD_ID = /^\d{5,25}$/;
export const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Throws an HTTP error; index.ts turns it into `{error}` JSON. */
export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message });
}

export type Body = Record<string, unknown>;

/** Parses a JSON object body, refusing anything not sent as application/json. */
export async function readJson(req: Request): Promise<Body> {
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get('content-type') ?? ''))
    fail(415, 'Expected application/json');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    fail(400, 'Malformed JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected a JSON object');
  return body as Body;
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') fail(400, `${field} must be true or false`);
  return v;
}
export const optBool = (v: unknown, field: string) => (v === undefined ? undefined : bool(v, field));

/** Optional display name: trimmed, at most 100 chars, empty means null. */
export function optName(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || v.length > 100) fail(400, 'name must be a string of at most 100 characters');
  return v.trim() || null;
}

/** De-duplicated list of Discord ids. */
export function idList(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.length > 500 || !v.every((x) => typeof x === 'string' && DISCORD_ID.test(x)))
    fail(400, `${field} must be a list of Discord ids`);
  return [...new Set(v as string[])];
}

export function parseLimit(v: string | undefined, dflt = 50, max = 100): number {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(400, `limit must be 1-${max}`);
  return n;
}

// Keyset cursor: "<received_at>_<id>" of the last row on the previous page.
export const encodeCursor = (receivedAt: number, id: string) => `${receivedAt}_${id}`;
export function parseCursor(v: string | undefined): [number, string] | null {
  if (!v) return null;
  const m = v.match(/^(\d{1,16})_([0-9a-f-]{36})$/);
  if (!m) fail(400, 'Invalid cursor');
  return [Number(m[1]), m[2]];
}

/** LIKE pattern for a literal substring (use with ESCAPE '\'). */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

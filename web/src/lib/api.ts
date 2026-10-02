// Typed client for the Worker's /api. Every call is same-origin with the session
// cookie; JSON bodies always carry content-type application/json (the server
// requires it alongside its Origin check).

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Me = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  canCreate: boolean;
  seeAll: boolean;
  domain: string;
};

export type Alias = {
  address: string;
  createdBy: string;
  createdAt: number;
  messageCount: number;
  unreadCount: number;
  lastReceivedAt: number | null;
};

export type MessageSummary = {
  id: string;
  address: string;
  from: string;
  subject: string;
  preview: string | null;
  receivedAt: number;
  size: number;
  read: boolean;
};

export type Attachment = { index: number; filename: string | null; size: number; contentType: string };

export type Message = {
  id: string;
  address: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: number;
  size: number;
  text: string | null;
  hasHtml: boolean;
  attachments: Attachment[];
};

export type Stats = {
  users: number;
  aliases: number;
  messages: number;
  storageBytes: number;
  messagesLast24h: number;
  retentionDays: number;
};

export type AdminUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  canCreate: boolean;
  seeAll: boolean;
  permanentAdmin: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  aliasCount: number;
};

export type AdminAlias = {
  address: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: number;
  messageCount: number;
  users: { id: string; name: string | null }[];
};

export type UserFlags = { isAdmin: boolean; canCreate: boolean; seeAll: boolean };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string') msg = j.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }
  const text = res.status === 204 ? '' : await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

export const urls = {
  body: (id: string) => `/api/messages/${enc(id)}/body`,
  raw: (id: string) => `/api/messages/${enc(id)}/raw`,
  attachment: (id: string, index: number) => `/api/messages/${enc(id)}/attachments/${index}`,
  login: '/auth/login',
};

export const api = {
  me: () => req<Me>('GET', '/me'),
  logout: () => req<void>('POST', '/auth/logout'),

  aliases: () => req<{ aliases: Alias[] }>('GET', '/aliases'),
  createAlias: (body: { local?: string; grantTo?: string[] }) => req<{ address: string }>('POST', '/aliases', body),
  deleteAlias: (address: string) => req<void>('DELETE', `/aliases/${enc(address)}`),

  messages: (p: { alias?: string; q?: string; cursor?: string | null; limit?: number }) => {
    const s = new URLSearchParams();
    if (p.alias) s.set('alias', p.alias);
    if (p.q) s.set('q', p.q);
    if (p.cursor) s.set('cursor', p.cursor);
    if (p.limit) s.set('limit', String(p.limit));
    const qs = s.toString();
    return req<{ messages: MessageSummary[]; nextCursor: string | null }>('GET', `/messages${qs ? `?${qs}` : ''}`);
  },
  message: (id: string) => req<Message>('GET', `/messages/${enc(id)}`),
  setRead: (id: string, read: boolean) => req<void>('POST', `/messages/${enc(id)}/read`, { read }),
  deleteMessage: (id: string) => req<void>('DELETE', `/messages/${enc(id)}`),

  admin: {
    stats: () => req<Stats>('GET', '/admin/stats'),
    users: () => req<{ users: AdminUser[] }>('GET', '/admin/users'),
    createUser: (body: { id: string; name?: string } & UserFlags) => req<void>('POST', '/admin/users', body),
    updateUser: (id: string, body: Partial<UserFlags> & { name?: string }) =>
      req<void>('PATCH', `/admin/users/${enc(id)}`, body),
    deleteUser: (id: string) => req<void>('DELETE', `/admin/users/${enc(id)}`),
    aliases: () => req<{ aliases: AdminAlias[] }>('GET', '/admin/aliases'),
    setAccess: (address: string, userIds: string[]) =>
      req<void>('PUT', `/admin/aliases/${enc(address)}/access`, { userIds }),
  },
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

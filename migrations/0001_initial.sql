-- Initial schema as deployed before migrations existed. IF NOT EXISTS makes it a no-op on the live database.
-- Discord user id is the primary key; only ids listed here can log in.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  see_all INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS aliases (
  address TEXT PRIMARY KEY,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alias_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL REFERENCES aliases(address) ON DELETE CASCADE,
  PRIMARY KEY (user_id, address)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL REFERENCES aliases(address) ON DELETE CASCADE,
  from_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_address ON messages(address, received_at DESC);
CREATE INDEX IF NOT EXISTS messages_by_time ON messages(received_at);

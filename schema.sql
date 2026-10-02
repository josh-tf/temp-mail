-- Reference only: equals migrations/ applied in order. Change the schema with a new additive migration, never here.
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
ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;
ALTER TABLE messages ADD COLUMN preview TEXT;

-- Per-user read state; a row means "read".
CREATE TABLE IF NOT EXISTS message_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS message_reads_by_message ON message_reads(message_id);

-- Keyset pagination on (received_at, id), globally and per alias.
CREATE INDEX IF NOT EXISTS messages_by_time_id ON messages(received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS messages_by_address_time_id ON messages(address, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS alias_access_by_address ON alias_access(address);

-- Logout revokes every session issued before this time (unix seconds).
ALTER TABLE users ADD COLUMN sessions_after INTEGER NOT NULL DEFAULT 0;

-- messages_by_address is a strict prefix of messages_by_address_time_id and is never chosen;
-- messages_by_time is replaced by a covering index for the admin stats (COUNT, SUM(size), last 24 h).
-- Dropping an index removes no data and only saves write cost on every message insert/delete.
DROP INDEX IF EXISTS messages_by_address;
DROP INDEX IF EXISTS messages_by_time;
CREATE INDEX IF NOT EXISTS messages_by_time_size ON messages(received_at, size);

-- Additive only: the remote database holds live data.
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

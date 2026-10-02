-- Logout revokes every session issued before this time (unix seconds).
ALTER TABLE users ADD COLUMN sessions_after INTEGER NOT NULL DEFAULT 0;

-- messages_by_address is a strict prefix of messages_by_address_time_id and is never chosen;
-- messages_by_time is replaced by a covering index for the admin stats (COUNT, SUM(size), last 24 h).
-- Dropping an index removes no data and only saves write cost on every message insert/delete.
DROP INDEX IF EXISTS messages_by_address;
DROP INDEX IF EXISTS messages_by_time;
CREATE INDEX IF NOT EXISTS messages_by_time_size ON messages(received_at, size);

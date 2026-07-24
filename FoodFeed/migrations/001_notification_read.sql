ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_notifs_user_unread ON notifications(user_id, read_at);

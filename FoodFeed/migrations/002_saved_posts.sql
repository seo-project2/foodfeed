CREATE TABLE IF NOT EXISTS saved_posts (
    user_id TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES food_posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_posts(user_id, saved_at DESC);

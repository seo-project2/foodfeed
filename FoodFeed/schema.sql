CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    edu_verified BOOLEAN DEFAULT 0
);

CREATE TABLE food_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location_text TEXT NOT NULL,
    lat REAL,
    lng REAL,
    tag TEXT,
    organization TEXT,
    expiry_time TIMESTAMP NOT NULL,
    image_url TEXT,
    moderation_score REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius_miles REAL NOT NULL,
    keyword TEXT,
    end_date TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES food_posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_food_posts_expiry ON food_posts(expiry_time);
CREATE INDEX idx_subs_user ON subscriptions(user_id);
CREATE INDEX idx_notifs_user ON notifications(user_id);

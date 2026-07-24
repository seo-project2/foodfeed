CREATE TABLE schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    email_domain TEXT NOT NULL,
    primary_color TEXT NOT NULL,
    primary_soft TEXT NOT NULL,
    on_primary TEXT NOT NULL,
    logo_path TEXT NOT NULL,
    center_lat REAL NOT NULL,
    center_lng REAL NOT NULL
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    edu_verified BOOLEAN DEFAULT 0,
    school_id TEXT REFERENCES schools(id)
);

CREATE TABLE food_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    school_id TEXT NOT NULL REFERENCES schools(id),
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

CREATE TABLE post_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('otw', 'got', 'late', 'gone', 'still')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (post_id, user_id, kind),
    FOREIGN KEY (post_id) REFERENCES food_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_food_posts_expiry ON food_posts(expiry_time);
CREATE INDEX idx_food_posts_school ON food_posts(school_id);
CREATE INDEX idx_subs_user ON subscriptions(user_id);
CREATE INDEX idx_notifs_user ON notifications(user_id);
CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_reactions_user_post_kind ON post_reactions(user_id, post_id, kind);

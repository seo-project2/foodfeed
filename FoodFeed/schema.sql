-- FoodFeed schema. Names align with the project overview (lowercase, plural, `expiry_time`).

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
    lat REAL NOT NULL,
    lng REAL NOT NULL,
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

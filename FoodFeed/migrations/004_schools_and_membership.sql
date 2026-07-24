CREATE TABLE IF NOT EXISTS schools (
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

INSERT OR IGNORE INTO schools (id, name, short_name, email_domain, primary_color, primary_soft, on_primary, logo_path, center_lat, center_lng) VALUES
    ('uchicago', 'University of Chicago', 'U Chicago', 'uchicago.edu', '#800000', '#F3E4E4', '#FFFFFF', '/schools/uchicago.svg', 41.7886, -87.5987),
    ('washu', 'Washington University in St. Louis', 'WashU', 'wustl.edu', '#0C5C3F', '#E4EFEA', '#FFFFFF', '/schools/washu.svg', 38.6488, -90.3108),
    ('yale', 'Yale University', 'Yale', 'yale.edu', '#0F4D92', '#E4EBF3', '#FFFFFF', '/schools/yale.svg', 41.3163, -72.9223);

ALTER TABLE users ADD COLUMN school_id TEXT REFERENCES schools(id);

ALTER TABLE food_posts ADD COLUMN school_id TEXT NOT NULL DEFAULT 'washu' REFERENCES schools(id);

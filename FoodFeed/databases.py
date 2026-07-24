import os
import sqlite3

from .config import DATABASE_PATH
from .seed_schools import seed_schools

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_FILE = os.path.join(HERE, "schema.sql")
MIGRATIONS_DIR = os.path.join(HERE, "migrations")

SEED_USER_ID = "dev-seed-user"

DROP_ORDER = ("post_reactions", "saved_posts", "notifications", "subscriptions", "food_posts", "users", "schools")


def _ensure_db_dir():
    d = os.path.dirname(DATABASE_PATH)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)


def get_db_connection():
    """Get a connection to the SQLite database with FK enforcement enabled."""
    _ensure_db_dir()
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_exists(conn, name):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def ensure_schema():
    """Create schema on first boot and apply pending migrations. Idempotent."""
    conn = get_db_connection()
    try:
        if not _table_exists(conn, "users"):
            with open(SCHEMA_FILE, "r") as f:
                conn.executescript(f.read())
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, name, edu_verified) VALUES (?, ?, ?, ?)",
                (SEED_USER_ID, "dev@wustl.edu", "Dev Seed", 1),
            )
            seed_schools(conn)
            conn.commit()
        _run_migrations(conn)
        if _table_exists(conn, "schools"):
            seed_schools(conn)
            conn.commit()
    finally:
        conn.close()


def _run_migrations(conn):
    if not os.path.isdir(MIGRATIONS_DIR):
        return
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(name TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    applied = {r[0] for r in conn.execute("SELECT name FROM schema_migrations").fetchall()}
    for fname in sorted(os.listdir(MIGRATIONS_DIR)):
        if not fname.endswith(".sql") or fname in applied:
            continue
        with open(os.path.join(MIGRATIONS_DIR, fname), "r") as f:
            conn.executescript(f.read())
        conn.execute("INSERT INTO schema_migrations (name) VALUES (?)", (fname,))
        conn.commit()


def init_db():
    """Drop and recreate schema. For local development only."""
    print("Initializing database...")
    _ensure_db_dir()
    conn = get_db_connection()
    for table in DROP_ORDER:
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.execute("DROP TABLE IF EXISTS schema_migrations")
    with open(SCHEMA_FILE, "r") as f:
        conn.executescript(f.read())
    conn.execute(
        "INSERT OR IGNORE INTO users (id, email, name, edu_verified) VALUES (?, ?, ?, ?)",
        (SEED_USER_ID, "dev@wustl.edu", "Dev Seed", 1),
    )
    seed_schools(conn)
    conn.commit()
    _run_migrations(conn)
    conn.close()
    print("Database initialized successfully.")


if __name__ == "__main__":
    init_db()

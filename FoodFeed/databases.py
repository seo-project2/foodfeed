import sqlite3
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(HERE, "foodfeed.db")
SCHEMA_FILE = os.path.join(HERE, "schema.sql")

SEED_USER_ID = "dev-seed-user"

DROP_ORDER = ("notifications", "subscriptions", "food_posts", "users")


def get_db_connection():
    """Get a connection to the SQLite database with FK enforcement enabled."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Reads the SQL schema from a file and initializes the database."""
    if not os.path.exists(SCHEMA_FILE):
        print(f"Error: {SCHEMA_FILE} not found!")
        return

    print("Initializing database...")
    conn = get_db_connection()
    for table in DROP_ORDER:
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    with open(SCHEMA_FILE, "r") as f:
        conn.executescript(f.read())
    conn.execute(
        "INSERT OR IGNORE INTO users (id, email, name, edu_verified) VALUES (?, ?, ?, ?)",
        (SEED_USER_ID, "dev@wustl.edu", "Dev Seed", 1),
    )
    conn.commit()
    conn.close()
    print("Database initialized successfully.")


if __name__ == "__main__":
    init_db()

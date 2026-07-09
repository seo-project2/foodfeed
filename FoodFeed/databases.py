import sqlite3
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(HERE, "foodfeed.db")
SCHEMA_FILE = os.path.join(HERE, "schema.sql")


def get_db_connection():
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Reads the SQL schema from a file and initializes the database."""
    if not os.path.exists(SCHEMA_FILE):
        print(f"Error: {SCHEMA_FILE} not found!")
        return

    print("Initializing database...")
    conn = get_db_connection()
    with open(SCHEMA_FILE, "r") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
    print("Database initialized successfully.")


if __name__ == "__main__":
    init_db()

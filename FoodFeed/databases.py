import sqlite3
import os

DB_FILE = "foodfeed.db"


def get_db_connection():
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(DB_FILE)

    conn.row_factory = sqlite3.Row  # Enable named column access
    return conn


def init_db():
    """Reads the SQL schema from a file and initializes the database."""
    if not os.path.exists('schema.sql'):
        print("Error: schema.sql not found!")
        return

    print("Initializing database...")
    conn = get_db_connection()

    with open('schema.sql', 'r') as f:
        conn.executescript(f.read())


    conn.commit()
    conn.close()
    print("Databases initialized successfully.")

if __name__ == "__main__":
    init_db()
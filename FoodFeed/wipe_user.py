"""Demo reset: delete a single user row by email.

Usage: python -m FoodFeed.wipe_user <email>

Only the users row is removed. Posts, subscriptions, notifications, and
saved-posts owned by that user linger with a dangling user_id — the feed
pulls by school, so the visible impact is zero. On next sign-in the same
email creates a new UUID user row with school_id = NULL and onboarding
triggers again. For a scorched-earth reset, write a separate script.
"""
import sys

from .databases import get_db_connection


def wipe_user(email):
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        if row is None:
            print(f"No user with email {email!r}.")
            return 1
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("DELETE FROM users WHERE email = ?", (email,))
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON")
        print(f"Deleted user {email} (id={row['id']}).")
        return 0
    finally:
        conn.close()


def main(argv):
    if len(argv) != 2:
        print("Usage: python -m FoodFeed.wipe_user <email>", file=sys.stderr)
        return 2
    return wipe_user(argv[1])


if __name__ == "__main__":
    sys.exit(main(sys.argv))

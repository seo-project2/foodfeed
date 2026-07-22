"""Seed the DB with demo posts. Bypasses geocoding by supplying lat/lng directly.

Run: python -m FoodFeed.seed_demo
"""
from datetime import datetime, timedelta, timezone

from .databases import SEED_USER_ID, get_db_connection

POSTS = [
    {
        "title": "Free bagels — Hillel morning social",
        "location": "Umrath Hall lounge",
        "lat": 38.6488,
        "lng": -90.3108,
        "tag": "bagels",
        "minutes": 40,
        "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Pizza left over from CS mixer",
        "location": "Simon Hall lobby",
        "lat": 38.6470,
        "lng": -90.3050,
        "tag": "pizza",
        "minutes": 25,
        "image_url": "https://images.unsplash.com/photo-1548365328-9f547fb0953b?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Chick-fil-A trays after guest lecture",
        "location": "Danforth University Center, room 276",
        "lat": 38.6484,
        "lng": -90.3055,
        "tag": "chicken",
        "minutes": 90,
        "image_url": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Fresh donuts — pre-med club",
        "location": "McDonnell Hall atrium",
        "lat": 38.6489,
        "lng": -90.3095,
        "tag": "donuts",
        "minutes": 15,
        "image_url": "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Sushi platters from board meeting",
        "location": "Knight Hall executive suite",
        "lat": 38.6503,
        "lng": -90.3020,
        "tag": "sushi",
        "minutes": 60,
        "image_url": "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Salad bar — leftover from career fair",
        "location": "Athletic Complex, main gym",
        "lat": 38.6467,
        "lng": -90.3035,
        "tag": "salad",
        "minutes": 120,
        "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Coffee & pastries — engineering open house",
        "location": "Whitaker Hall lobby",
        "lat": 38.6478,
        "lng": -90.3097,
        "tag": "pastries",
        "minutes": 45,
        "image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=70",
    },
    {
        "title": "Tacos from Latinx Student Union event",
        "location": "Tisch Commons",
        "lat": 38.6486,
        "lng": -90.3059,
        "tag": "tacos",
        "minutes": 30,
        "image_url": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=70",
    },
]


def seed():
    now = datetime.now(timezone.utc)
    conn = get_db_connection()
    conn.execute(
        "INSERT OR IGNORE INTO users (id, email, name, edu_verified) VALUES (?, ?, ?, ?)",
        (SEED_USER_ID, "dev@wustl.edu", "Dev Seed", 1),
    )
    conn.execute("DELETE FROM food_posts WHERE user_id = ?", (SEED_USER_ID,))
    for p in POSTS:
        expiry = (now + timedelta(minutes=p["minutes"])).isoformat()
        conn.execute(
            "INSERT INTO food_posts "
            "(user_id, title, location_text, tag, lat, lng, expiry_time, image_url) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (SEED_USER_ID, p["title"], p["location"], p["tag"], p["lat"], p["lng"], expiry, p["image_url"]),
        )
    conn.commit()
    count = conn.execute("SELECT COUNT(*) FROM food_posts").fetchone()[0]
    conn.close()
    print(f"Seeded. food_posts count: {count}")


if __name__ == "__main__":
    seed()

"""Seed the DB with realistic demo content across all three schools.

Run locally: ``python -m FoodFeed.seed_demo`` (wipes and reseeds the local DB).
Prod: called from ``FoodFeed/routes/dev.py`` via a token-gated HTTP endpoint.

Both entrypoints delegate to :func:`seed_all`, so behavior is identical.
"""
import os
import random
import shutil
import uuid
from datetime import datetime, timedelta, timezone

from .config import UPLOAD_DIR
from .databases import get_db_connection

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(HERE, "seed_assets")

USERS_PER_SCHOOL = 10

TAG_TO_PHOTOS = {
    "pizza": ("pizza-01.jpg", "pizza-02.jpg"),
    "tacos": ("tacos-01.jpg",),
    "bagels": ("bagels-01.jpg",),
    "sushi": ("sushi-01.jpg",),
    "cookies": ("cookies-01.jpg",),
    "salad": ("salad-01.jpg",),
    "donuts": ("donuts-01.jpg",),
    "chicken": ("chicken-01.jpg",),
    "sandwiches": ("sandwiches-01.jpg",),
    "boba": ("boba-01.jpg",),
    "dumplings": ("dumplings-01.jpg",),
    "coffee": ("coffee-01.jpg",),
    "pastries": ("pastries-01.jpg",),
    "curry": ("curry-01.jpg",),
    "fruit": ("fruit-01.jpg",),
}


# Per-school post templates. Locations are real buildings; lat/lng added at
# seed time from the school's center + a small offset per post index.
SCHOOL_POSTS = {
    "washu": [
        ("Free bagels — Hillel morning social", "Umrath Hall lounge", "bagels", "Hillel", 40),
        ("Pizza left over from CS mixer", "Simon Hall lobby", "pizza", "CS Club", 25),
        ("Chick-fil-A trays after guest lecture", "Danforth University Center 276", "chicken", "Pre-Med Society", 90),
        ("Fresh donuts — pre-med club meeting", "McDonnell Hall atrium", "donuts", "Pre-Med Society", 15),
        ("Sushi platters from board meeting", "Knight Hall exec suite", "sushi", "Olin Business School", 60),
        ("Salad bar leftover from career fair", "Athletic Complex, main gym", "salad", "Career Center", 120),
        ("Coffee + pastries — engineering open house", "Whitaker Hall lobby", "pastries", "BME Department", 45),
        ("Tacos from Latinx Student Union event", "Tisch Commons", "tacos", "Latinx Student Union", 30),
        ("Dumplings — Chinese Students Assoc lunch", "January Hall 110", "dumplings", "Chinese Students Assoc", 50),
        ("Chocolate chip cookies (a lot)", "Olin Library first floor", "cookies", "Study Group Alliance", 180),
        ("Boba tea — a10 anime club", "DUC 234", "boba", "Anime Club", 20),
        ("Curry night leftovers (South Asian Students)", "Uncle Joe's Coffee area", "curry", "South Asian Students Assoc", 70),
        ("Chick sandwiches from athletics banquet", "Sumers Rec, Aquatics wing", "sandwiches", "Athletics Dept", 240),
        ("Fruit trays after yoga class", "South 40 rec room", "fruit", "Yoga Club", 25),
        ("Espresso + croissants — French Club social", "Ridgley Hall 300", "pastries", "French Club", 5),
    ],
    "uchicago": [
        ("Deep dish pizza — Econ Dept end of quarter", "Saieh Hall 021", "pizza", "Econ Dept", 55),
        ("Bagels & lox — Hillel Shabbat prep", "Newberger Hillel Center", "bagels", "Hillel", 35),
        ("Free tacos — MPS student mixer", "Cobb Hall 402", "tacos", "MPS Students", 15),
        ("Sushi rolls — Booth open house", "Charles M. Harper Center", "sushi", "Booth GSB", 90),
        ("Cookies (chocolate chip and oatmeal)", "Regenstein Library A-level", "cookies", "Library Study Group", 200),
        ("Chicken wraps — Model UN meeting", "International House assembly", "chicken", "Model UN", 40),
        ("Salad bowls — Public Policy panel leftovers", "Keller Center 1101", "salad", "Harris Public Policy", 20),
        ("Donuts — CS TA office hours", "Crerar Library 390", "donuts", "CS TAs", 30),
        ("Boba — Taiwanese Student Union", "Reynolds Club McCormick Lounge", "boba", "Taiwanese Student Union", 45),
        ("Dumplings + spring rolls — Chinese Club", "Ida Noyes Hall Cloister Club", "dumplings", "Chinese Club", 60),
        ("Fresh fruit — Ryerson Physical Lab", "Ryerson Hall 258", "fruit", "Physics Dept", 25),
        ("Coffee bar leftover — Divinity School talk", "Swift Hall 3rd floor lounge", "coffee", "Divinity School", 10),
        ("Sandwiches — Political Union debate", "Kent Chemical Lab 107", "sandwiches", "Political Union", 75),
        ("Butter chicken curry — India Students Assoc", "Rockefeller Chapel basement", "curry", "India Students Assoc", 110),
        ("Croissants + pastries — French House", "Max Palevsky West lounge", "pastries", "French House", 4),
    ],
    "yale": [
        ("Pizza from GSAS orientation", "HGS Common Room", "pizza", "GSAS", 30),
        ("Bagels — Slifka Center brunch", "Slifka Center for Jewish Life", "bagels", "Slifka Center", 50),
        ("Fish tacos — Latinx Cultural Center", "La Casa Cultural", "tacos", "La Casa Cultural", 20),
        ("Sushi — SOM career trek leftovers", "Evans Hall room 2200", "sushi", "SOM Career Development", 60),
        ("Chocolate chip cookies — Yale Symphony", "Sprague Hall lobby", "cookies", "Yale Symphony Orchestra", 90),
        ("Chicken tenders — a cappella concert", "Battell Chapel foyer", "chicken", "Whiffenpoofs", 25),
        ("Green salads — YCC town hall", "Woodbridge Hall foyer", "salad", "Yale College Council", 45),
        ("Glazed donuts + coffee — Political Union", "Linsly-Chittenden 101", "donuts", "Yale Political Union", 15),
        ("Boba — Chinese American Students", "Silliman College common room", "boba", "Chinese American Students Assoc", 35),
        ("Dumplings & noodles — East Asian Studies", "Luce Hall 202", "dumplings", "East Asian Studies", 55),
        ("Fruit + granola bars — YSPH info session", "LEPH auditorium", "fruit", "School of Public Health", 20),
        ("Cortado + espresso bar — French Dept", "Hall of Graduate Studies lounge", "coffee", "French Dept", 10),
        ("Turkey sandwiches — YLS moot court", "Sterling Law 127", "sandwiches", "Yale Law School", 80),
        ("Massaman curry — Thai Students social", "Timothy Dwight College dining", "curry", "Thai Students Assoc", 65),
        ("Almond croissants — Yale Bakery Society", "Bass Library rotunda", "pastries", "Yale Bakery Society", 6),
    ],
}


def _demo_user_id(school_id, n):
    return f"demo-{school_id}-{n}"


def _demo_email(school_id, n):
    domain = {"washu": "wustl.edu", "uchicago": "uchicago.edu", "yale": "yale.edu"}[school_id]
    return f"demo{n}@{domain}"


def _demo_name(rng, school_id, n):
    first = rng.choice([
        "Alex", "Sam", "Riley", "Jordan", "Casey", "Morgan", "Avery", "Quinn",
        "Taylor", "Rowan", "Devon", "Kai", "Sage", "Emerson", "Blake",
    ])
    last_initial = chr(ord("A") + (hash((school_id, n)) & 0xF)) if False else rng.choice(list("BCDGKLMNPRSTVW"))
    return f"{first} {last_initial}."


def _pick_photo(rng, tag):
    choices = TAG_TO_PHOTOS.get(tag)
    if not choices:
        return None
    return rng.choice(choices)


def _copy_photo(asset_name):
    """Copy a seed asset into UPLOAD_DIR under a fresh uuid filename and
    return the ``/uploads/<name>`` URL the frontend expects."""
    src = os.path.join(ASSETS_DIR, asset_name)
    ext = os.path.splitext(asset_name)[1] or ".jpg"
    dst_name = f"{uuid.uuid4().hex}{ext}"
    dst = os.path.join(UPLOAD_DIR, dst_name)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    shutil.copyfile(src, dst)
    return f"/uploads/{dst_name}"


def _wipe(conn):
    """Delete all demo users and everything they created."""
    users = conn.execute(
        "SELECT id FROM users WHERE id LIKE 'demo-%'"
    ).fetchall()
    user_ids = [u["id"] for u in users]
    if not user_ids:
        return
    placeholders = ",".join("?" * len(user_ids))
    posts = conn.execute(
        f"SELECT id, image_url FROM food_posts WHERE user_id IN ({placeholders})",
        tuple(user_ids),
    ).fetchall()
    post_ids = [p["id"] for p in posts]
    # Delete uploaded seed photos on disk to avoid orphaning them.
    for p in posts:
        img = p["image_url"]
        if img and img.startswith("/uploads/"):
            path = os.path.join(UPLOAD_DIR, img[len("/uploads/"):])
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
    if post_ids:
        pp = ",".join("?" * len(post_ids))
        conn.execute(f"DELETE FROM post_reactions WHERE post_id IN ({pp})", tuple(post_ids))
        conn.execute(f"DELETE FROM saved_posts WHERE post_id IN ({pp})", tuple(post_ids))
        conn.execute(f"DELETE FROM notifications WHERE post_id IN ({pp})", tuple(post_ids))
        conn.execute(f"DELETE FROM food_posts WHERE id IN ({pp})", tuple(post_ids))
    conn.execute(
        f"DELETE FROM post_reactions WHERE user_id IN ({placeholders})",
        tuple(user_ids),
    )
    conn.execute(
        f"DELETE FROM saved_posts WHERE user_id IN ({placeholders})",
        tuple(user_ids),
    )
    conn.execute(
        f"DELETE FROM notifications WHERE user_id IN ({placeholders})",
        tuple(user_ids),
    )
    conn.execute(
        f"DELETE FROM users WHERE id IN ({placeholders})",
        tuple(user_ids),
    )
    conn.commit()


REACTION_KINDS_WEIGHTED = (
    ("otw", 4),
    ("got", 3),
    ("late", 1),
    ("still", 1),
    ("gone", 1),
)


def _sample_reactions(rng, user_pool):
    """For one post, decide which (user, kind) reaction rows exist.

    Enforces the mutex invariant: no single user gets both ``still`` and
    ``gone`` on the same post. Returns a list of ``(user_id, kind)`` pairs.
    """
    total = rng.randint(0, 8)
    if total == 0:
        return []
    reactors = rng.sample(user_pool, min(total, len(user_pool)))
    kinds, weights = zip(*REACTION_KINDS_WEIGHTED)
    rows = []
    for uid in reactors:
        kind = rng.choices(kinds, weights=weights, k=1)[0]
        rows.append((uid, kind))
    return rows


def _force_gone_ribbon(rng, user_pool, existing_rows):
    """Bump this post to at least 2 `gone` votes and 0 `still`, so the UI
    renders the 'Reported gone' ribbon. Called for a handful of posts."""
    # Drop any 'still' on this post to satisfy the "gone > still" ribbon rule.
    rows = [r for r in existing_rows if r[1] != "still"]
    existing_gone = {uid for uid, k in rows if k == "gone"}
    pool = [u for u in user_pool if u not in existing_gone]
    need = max(0, 2 - len(existing_gone))
    for uid in rng.sample(pool, min(need, len(pool))):
        rows = [r for r in rows if r[0] != uid]
        rows.append((uid, "gone"))
    return rows


def seed_all(conn, wipe=False, rng_seed=42):
    """Seed users, posts, reactions, saved rows across all three schools.

    Returns a dict of insert counts."""
    rng = random.Random(rng_seed)
    if wipe:
        _wipe(conn)

    now = datetime.now(timezone.utc)
    counts = {"posts_inserted": 0, "users_inserted": 0, "reactions_inserted": 0, "saved_inserted": 0}

    # Build users per school.
    users_by_school = {}
    for school_id in SCHOOL_POSTS.keys():
        ids = []
        for i in range(1, USERS_PER_SCHOOL + 1):
            uid = _demo_user_id(school_id, i)
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, name, edu_verified, school_id) "
                "VALUES (?, ?, ?, 1, ?)",
                (uid, _demo_email(school_id, i), _demo_name(rng, school_id, i), school_id),
            )
            counts["users_inserted"] += 1
            ids.append(uid)
        users_by_school[school_id] = ids

    # Insert posts.
    all_post_ids = []
    for school_id, templates in SCHOOL_POSTS.items():
        center = conn.execute(
            "SELECT center_lat, center_lng FROM schools WHERE id = ?", (school_id,)
        ).fetchone()
        if center is None:
            continue
        clat, clng = center["center_lat"], center["center_lng"]
        pool = users_by_school[school_id]
        # A few "just expired" posts per school (index 1 and 4) so the
        # feed hides them but sanity checks can still see them.
        just_expired_indices = {1, 4}
        for idx, (title, location, tag, org, base_minutes) in enumerate(templates):
            user_id = pool[idx % len(pool)]
            # Offset in degrees. ~0.003 ~ 300m.
            lat = clat + rng.uniform(-0.003, 0.003)
            lng = clng + rng.uniform(-0.003, 0.003)
            photo = _pick_photo(rng, tag)
            image_url = _copy_photo(photo) if photo else None
            if idx in just_expired_indices:
                # Expired between 1 and 25 min ago.
                expiry = now - timedelta(minutes=rng.randint(1, 25))
            else:
                # Jitter around base_minutes so timings feel natural.
                jitter = rng.randint(-3, 15)
                expiry = now + timedelta(minutes=max(2, base_minutes + jitter))
            cur = conn.execute(
                "INSERT INTO food_posts "
                "(user_id, school_id, title, location_text, tag, organization, "
                "lat, lng, expiry_time, image_url) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, school_id, title, location, tag, org, lat, lng,
                 expiry.isoformat(), image_url),
            )
            all_post_ids.append((cur.lastrowid, school_id))
            counts["posts_inserted"] += 1

    # Reactions. Pick a small number of posts per school to force a "gone"
    # ribbon so at least one is guaranteed visible on prod.
    gone_ribbon_targets = set()
    for school_id in SCHOOL_POSTS.keys():
        school_posts = [pid for pid, sid in all_post_ids if sid == school_id]
        # Pick 1-2 posts per school for the gone ribbon.
        picks = rng.sample(school_posts, min(2, len(school_posts)))
        gone_ribbon_targets.update(picks)

    for post_id, school_id in all_post_ids:
        pool = users_by_school[school_id]
        rows = _sample_reactions(rng, pool)
        if post_id in gone_ribbon_targets:
            rows = _force_gone_ribbon(rng, pool, rows)
        # Dedup (user_id, kind) pairs — post-force it's possible for a user
        # to appear twice with different kinds; the DB UNIQUE constraint is
        # (post_id, user_id, kind) so distinct kinds are fine, but let's
        # avoid inserting the same triple twice.
        seen = set()
        for uid, kind in rows:
            key = (uid, kind)
            if key in seen:
                continue
            seen.add(key)
            conn.execute(
                "INSERT OR IGNORE INTO post_reactions (post_id, user_id, kind) "
                "VALUES (?, ?, ?)",
                (post_id, uid, kind),
            )
            counts["reactions_inserted"] += 1

    # Saved rows. Each user saves 1-3 random posts within their school.
    for school_id, ids in users_by_school.items():
        school_posts = [pid for pid, sid in all_post_ids if sid == school_id]
        if not school_posts:
            continue
        for uid in ids:
            k = rng.randint(1, min(3, len(school_posts)))
            for pid in rng.sample(school_posts, k):
                conn.execute(
                    "INSERT OR IGNORE INTO saved_posts (user_id, post_id) "
                    "VALUES (?, ?)",
                    (uid, pid),
                )
                counts["saved_inserted"] += 1

    conn.commit()
    return counts


def main():
    conn = get_db_connection()
    try:
        counts = seed_all(conn, wipe=True)
    finally:
        conn.close()
    print(f"Seed complete: {counts}")


if __name__ == "__main__":
    main()

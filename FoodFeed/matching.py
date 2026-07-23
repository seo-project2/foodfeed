"""Match new food posts against active subscriptions.

Synchronous, run inline on POST /api/posts. Adequate for MVP scale
(dozens–hundreds of subscriptions). Move to a bbox pre-filter or a
background worker once subscription volume grows.
"""

from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.7613


def haversine_miles(lat1, lng1, lat2, lng2):
    lat1_r, lat2_r = radians(lat1), radians(lat2)
    dlat = lat2_r - lat1_r
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(a))


def build_message(title, keyword, location_text):
    """Server-generated notification copy. Keep templating in one place."""
    if keyword:
        return f'"{keyword}" match — {title} at {location_text}'
    return f"New nearby: {title} at {location_text}"


def find_matches(conn, post):
    """Return subscription rows that match the given post.

    Post must be a dict with lat, lng, title, user_id. Returns [] if the
    post has no coordinates. Excludes subscriptions owned by the poster.
    """
    if post.get("lat") is None or post.get("lng") is None:
        return []

    now_iso = datetime.now(timezone.utc).isoformat()
    subs = conn.execute(
        "SELECT id, user_id, lat, lng, radius_miles, keyword "
        "FROM subscriptions "
        "WHERE active = 1 "
        "  AND user_id != ? "
        "  AND (end_date IS NULL OR end_date > ?)",
        (post["user_id"], now_iso),
    ).fetchall()

    title_lower = (post.get("title") or "").lower()
    matches = []
    for sub in subs:
        distance = haversine_miles(post["lat"], post["lng"], sub["lat"], sub["lng"])
        if distance > sub["radius_miles"]:
            continue
        keyword = (sub["keyword"] or "").strip().lower()
        if keyword and keyword not in title_lower:
            continue
        matches.append(dict(sub))
    return matches

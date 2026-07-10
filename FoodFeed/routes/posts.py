from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection
from ..geocoding import geocode

bp = Blueprint("posts", __name__, url_prefix="/api/posts")


@bp.get("")
def list_posts():
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, title, location_text, tag, lat, lng, expiry_time "
        "FROM food_posts WHERE expiry_time > ? ORDER BY expiry_time ASC",
        (now,),
    ).fetchall()
    conn.close()
    return jsonify([_to_feed_item(r) for r in rows])


@bp.get("/map")
def list_map_posts():
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, title, location_text, tag, lat, lng, expiry_time "
        "FROM food_posts "
        "WHERE expiry_time > ? AND lat IS NOT NULL AND lng IS NOT NULL "
        "ORDER BY expiry_time ASC",
        (now,),
    ).fetchall()
    conn.close()
    return jsonify([_to_feed_item(r) for r in rows])


@bp.post("")
@require_auth
def create_post():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    location = (body.get("location") or "").strip()
    minutes = body.get("minutes")
    tag = (body.get("tag") or "").strip() or None

    if not title or not location:
        return jsonify({"error": "title and location are required"}), 400
    try:
        minutes_int = int(minutes)
        if minutes_int <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "minutes must be a positive integer"}), 400

    expiry = datetime.now(timezone.utc) + timedelta(minutes=minutes_int)
    coords = geocode(location)
    lat, lng = coords if coords else (None, None)

    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO food_posts (user_id, title, location_text, tag, lat, lng, expiry_time) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (current_user_id(), title, location, tag, lat, lng, expiry.isoformat()),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, title, location_text, tag, lat, lng, expiry_time "
        "FROM food_posts WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    conn.close()
    return jsonify(_to_feed_item(row)), 201


def _to_feed_item(row):
    expiry = datetime.fromisoformat(row["expiry_time"])
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    minutes_left = max(0, int((expiry - datetime.now(timezone.utc)).total_seconds() // 60))
    item = {
        "id": row["id"],
        "title": row["title"],
        "location": row["location_text"],
        "tag": row["tag"],
        "minutesLeft": minutes_left,
    }
    if row["lat"] is not None and row["lng"] is not None:
        item["lat"] = row["lat"]
        item["lng"] = row["lng"]
    return item

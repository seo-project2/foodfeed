import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection
from ..geocoding import geocode
from ..matching import build_message, find_matches

bp = Blueprint("posts", __name__, url_prefix="/api/posts")

log = logging.getLogger(__name__)


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
    user_id = current_user_id()

    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO food_posts (user_id, title, location_text, tag, lat, lng, expiry_time) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, title, location, tag, lat, lng, expiry.isoformat()),
    )
    post_id = cur.lastrowid

    conn.execute("SAVEPOINT notifs")
    try:
        matches = find_matches(
            conn,
            {"user_id": user_id, "title": title, "lat": lat, "lng": lng},
        )
        if matches:
            rows = [
                (
                    post_id,
                    m["user_id"],
                    build_message(title, m.get("keyword"), location),
                )
                for m in matches
            ]
            conn.executemany(
                "INSERT INTO notifications (post_id, user_id, message) VALUES (?, ?, ?)",
                rows,
            )
        conn.execute("RELEASE SAVEPOINT notifs")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT notifs")
        conn.execute("RELEASE SAVEPOINT notifs")
        log.exception("notification insert failed for post_id=%s", post_id)

    conn.commit()
    row = conn.execute(
        "SELECT id, title, location_text, tag, lat, lng, expiry_time "
        "FROM food_posts WHERE id = ?",
        (post_id,),
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

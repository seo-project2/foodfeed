from datetime import datetime, timezone

from flask import Blueprint, jsonify

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection

bp = Blueprint("saved", __name__)


@bp.post("/api/posts/<int:post_id>/save")
@require_auth
def save_post(post_id):
    user_id = current_user_id()
    conn = get_db_connection()
    exists = conn.execute("SELECT 1 FROM food_posts WHERE id = ?", (post_id,)).fetchone()
    if exists is None:
        conn.close()
        return jsonify({"error": "post not found"}), 404
    conn.execute(
        "INSERT OR IGNORE INTO saved_posts (user_id, post_id) VALUES (?, ?)",
        (user_id, post_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "saved": True})


@bp.delete("/api/posts/<int:post_id>/save")
@require_auth
def unsave_post(post_id):
    user_id = current_user_id()
    conn = get_db_connection()
    conn.execute(
        "DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?",
        (user_id, post_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "saved": False})


@bp.get("/api/me/saved")
@require_auth
def list_saved():
    user_id = current_user_id()
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    school_row = conn.execute(
        "SELECT school_id FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    school_id = school_row["school_id"] if school_row else None
    if school_id is None:
        conn.close()
        return jsonify({"posts": [], "ids": []})
    rows = conn.execute(
        "SELECT p.id, p.title, p.location_text, p.tag, p.organization, p.lat, p.lng, p.image_url, p.expiry_time, s.saved_at "
        "FROM saved_posts s JOIN food_posts p ON p.id = s.post_id "
        "WHERE s.user_id = ? AND p.expiry_time > ? AND p.school_id = ? "
        "ORDER BY s.saved_at DESC",
        (user_id, now, school_id),
    ).fetchall()
    ids = conn.execute(
        "SELECT s.post_id FROM saved_posts s JOIN food_posts p ON p.id = s.post_id "
        "WHERE s.user_id = ? AND p.school_id = ?",
        (user_id, school_id),
    ).fetchall()
    conn.close()

    posts = []
    for row in rows:
        expiry = datetime.fromisoformat(row["expiry_time"])
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        minutes_left = max(0, int((expiry - datetime.now(timezone.utc)).total_seconds() // 60))
        posts.append({
            "id": row["id"],
            "title": row["title"],
            "location": row["location_text"],
            "tag": row["tag"],
            "organization": row["organization"],
            "minutesLeft": minutes_left,
            "imageUrl": row["image_url"],
            "lat": row["lat"],
            "lng": row["lng"],
        })
    return jsonify({
        "posts": posts,
        "ids": [r["post_id"] for r in ids],
    })

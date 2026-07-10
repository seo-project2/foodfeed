from datetime import datetime

from flask import Blueprint, jsonify, request

from ..auth import current_user_id
from ..databases import get_db_connection

bp = Blueprint("subscriptions", __name__, url_prefix="/api/subscriptions")


@bp.get("")
def list_subscriptions():
    user_id = current_user_id()
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, lat, lng, radius_miles, keyword, end_date, created_at "
        "FROM subscriptions WHERE user_id = ? AND active = 1 "
        "ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return jsonify([_to_subscription(r) for r in rows])


@bp.post("")
def create_subscription():
    body = request.get_json(silent=True) or {}
    lat = body.get("lat")
    lng = body.get("lng")
    radius = body.get("radius_miles")
    keyword = body.get("keyword")
    end_date_raw = body.get("end_date")

    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng must be numbers"}), 400

    try:
        radius_f = float(radius)
        if radius_f <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "radius_miles must be a positive number"}), 400

    keyword_clean = (keyword or "").strip() or None

    end_date_clean = None
    if end_date_raw is not None and end_date_raw != "":
        try:
            datetime.fromisoformat(end_date_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "end_date must be ISO 8601"}), 400
        end_date_clean = end_date_raw

    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO subscriptions (user_id, lat, lng, radius_miles, keyword, end_date) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (current_user_id(), lat_f, lng_f, radius_f, keyword_clean, end_date_clean),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, lat, lng, radius_miles, keyword, end_date, created_at "
        "FROM subscriptions WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    conn.close()
    return jsonify(_to_subscription(row)), 201


@bp.delete("/<int:sub_id>")
def delete_subscription(sub_id):
    user_id = current_user_id()
    conn = get_db_connection()
    cur = conn.execute(
        "UPDATE subscriptions SET active = 0 "
        "WHERE id = ? AND user_id = ? AND active = 1",
        (sub_id, user_id),
    )
    conn.commit()
    changed = cur.rowcount
    conn.close()
    if changed == 0:
        return jsonify({"error": "not found"}), 404
    return "", 204


def _to_subscription(row):
    return {
        "id": row["id"],
        "lat": row["lat"],
        "lng": row["lng"],
        "radius_miles": row["radius_miles"],
        "keyword": row["keyword"],
        "end_date": row["end_date"],
        "created_at": row["created_at"],
    }

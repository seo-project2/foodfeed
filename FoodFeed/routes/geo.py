from flask import Blueprint, jsonify, request

from ..auth import current_user_id
from ..databases import get_db_connection
from ..geocoding import geocode

bp = Blueprint("geo", __name__)


@bp.get("/api/geocode")
def geocode_endpoint():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"error": "q is required"}), 400
    near = _school_center()
    coords = geocode(q, near=near)
    if not coords:
        return jsonify({"error": "not_found"}), 404
    lat, lng = coords
    return jsonify({"lat": lat, "lng": lng})


def _school_center():
    user_id = current_user_id()
    if not user_id:
        return None
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT s.center_lat, s.center_lng FROM users u "
            "JOIN schools s ON s.id = u.school_id WHERE u.id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return row["center_lat"], row["center_lng"]

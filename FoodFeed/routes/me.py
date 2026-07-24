from flask import Blueprint, jsonify, request

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection

bp = Blueprint("me", __name__, url_prefix="/api/me")


@bp.get("")
@require_auth
def get_me():
    conn = get_db_connection()
    payload = _me_payload(conn, current_user_id())
    conn.close()
    if payload is None:
        return jsonify({"error": "user not found"}), 404
    return jsonify(payload)


@bp.patch("/school")
@require_auth
def set_school():
    body = request.get_json(silent=True) or {}
    school_id = (body.get("school_id") or "").strip()
    if not school_id:
        return jsonify({"error": "school_id is required"}), 400

    conn = get_db_connection()
    try:
        exists = conn.execute(
            "SELECT 1 FROM schools WHERE id = ?", (school_id,)
        ).fetchone()
        if exists is None:
            return jsonify({"error": "unknown school"}), 404
        conn.execute(
            "UPDATE users SET school_id = ? WHERE id = ?",
            (school_id, current_user_id()),
        )
        conn.commit()
        payload = _me_payload(conn, current_user_id())
    finally:
        conn.close()
    if payload is None:
        return jsonify({"error": "user not found"}), 404
    return jsonify(payload)


def _me_payload(conn, user_id):
    row = conn.execute(
        "SELECT u.id, u.email, u.name, u.edu_verified, u.school_id, "
        "s.id AS s_id, s.name AS s_name, s.short_name AS s_short_name, "
        "s.email_domain AS s_email_domain, s.primary_color AS s_primary_color, "
        "s.primary_soft AS s_primary_soft, s.on_primary AS s_on_primary, "
        "s.logo_path AS s_logo_path, s.center_lat AS s_center_lat, "
        "s.center_lng AS s_center_lng "
        "FROM users u LEFT JOIN schools s ON s.id = u.school_id "
        "WHERE u.id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    school = None
    if row["s_id"]:
        school = {
            "id": row["s_id"],
            "name": row["s_name"],
            "short_name": row["s_short_name"],
            "email_domain": row["s_email_domain"],
            "primary_color": row["s_primary_color"],
            "primary_soft": row["s_primary_soft"],
            "on_primary": row["s_on_primary"],
            "logo_path": row["s_logo_path"],
            "center_lat": row["s_center_lat"],
            "center_lng": row["s_center_lng"],
        }
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "edu_verified": bool(row["edu_verified"]),
        "school_id": row["school_id"],
        "school": school,
    }

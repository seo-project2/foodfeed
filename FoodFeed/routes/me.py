from flask import Blueprint, jsonify

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection

bp = Blueprint("me", __name__, url_prefix="/api/me")


@bp.get("")
@require_auth
def get_me():
    user_id = current_user_id()
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, email, name, edu_verified FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "user not found"}), 404
    return jsonify({
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "edu_verified": bool(row["edu_verified"]),
    })

from flask import Blueprint, jsonify

from ..auth import current_user_id, require_auth
from ..databases import get_db_connection

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp.get("")
@require_auth
def list_notifications():
    user_id = current_user_id()
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, post_id, message, sent_at "
        "FROM notifications WHERE user_id = ? "
        "ORDER BY sent_at DESC LIMIT 50",
        (user_id,),
    ).fetchall()
    conn.close()
    return jsonify([
        {
            "id": r["id"],
            "post_id": r["post_id"],
            "message": r["message"],
            "sent_at": r["sent_at"],
        }
        for r in rows
    ])

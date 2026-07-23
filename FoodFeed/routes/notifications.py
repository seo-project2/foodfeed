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
        "SELECT id, post_id, message, sent_at, read_at "
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
            "read_at": r["read_at"],
        }
        for r in rows
    ])


@bp.patch("/<int:notif_id>/read")
@require_auth
def mark_read(notif_id):
    user_id = current_user_id()
    conn = get_db_connection()
    cur = conn.execute(
        "UPDATE notifications SET read_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND user_id = ? AND read_at IS NULL",
        (notif_id, user_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({"ok": True, "already_read": True})
    return jsonify({"ok": True})


@bp.post("/read_all")
@require_auth
def mark_all_read():
    user_id = current_user_id()
    conn = get_db_connection()
    cur = conn.execute(
        "UPDATE notifications SET read_at = CURRENT_TIMESTAMP "
        "WHERE user_id = ? AND read_at IS NULL",
        (user_id,),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "marked": cur.rowcount})

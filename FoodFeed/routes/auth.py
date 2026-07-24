import uuid

from flask import Blueprint, jsonify, request, session

from ..auth import verify_google_token
from ..config import ALLOWED_EMAIL_SUFFIX
from ..databases import get_db_connection

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/google")
def google_sign_in():
    body = request.get_json(silent=True) or {}
    id_token_str = body.get("id_token")
    if not id_token_str:
        return jsonify({"error": "id_token is required"}), 400

    try:
        claims = verify_google_token(id_token_str)
    except ValueError as exc:
        return jsonify({"error": f"invalid token: {exc}"}), 401

    email = claims.get("email")
    if not email:
        return jsonify({"error": "token missing email"}), 401
    if not email.lower().endswith(ALLOWED_EMAIL_SUFFIX):
        return jsonify({"error": f"email must end in {ALLOWED_EMAIL_SUFFIX}"}), 403
    name = claims.get("name") or ""

    conn = get_db_connection()
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if row is None:
        user_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (id, email, name, edu_verified) VALUES (?, ?, ?, 1)",
            (user_id, email, name),
        )
        conn.commit()
    else:
        user_id = row["id"]
        conn.execute(
            "UPDATE users SET name = ?, edu_verified = 1 WHERE id = ?",
            (name, user_id),
        )
        conn.commit()

    from .me import _me_payload
    payload = _me_payload(conn, user_id)
    conn.close()

    session["user_id"] = user_id
    return jsonify(payload)


@bp.post("/logout")
def logout():
    session.pop("user_id", None)
    return "", 204

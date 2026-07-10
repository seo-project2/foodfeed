from functools import wraps

from flask import jsonify, request, session
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .config import GOOGLE_CLIENT_ID, IS_DEV


def current_user_id():
    """Return the authenticated user id, or None.

    Reads `session["user_id"]` set by the Google sign-in flow. In development
    only, falls back to the `X-User-Id` header so curl-based testing keeps
    working — this fallback is disabled outside development.
    """
    user_id = session.get("user_id")
    if user_id:
        return user_id
    if IS_DEV:
        return request.headers.get("X-User-Id")
    return None


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if current_user_id() is None:
            return jsonify({"error": "authentication required"}), 401
        return f(*args, **kwargs)

    return wrapper


def verify_google_token(id_token_str):
    """Verify a Google ID token and return the decoded claims.

    Raises ValueError on any verification failure (invalid signature, wrong
    audience, expired token, etc.).
    """
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")
    return id_token.verify_oauth2_token(
        id_token_str,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )

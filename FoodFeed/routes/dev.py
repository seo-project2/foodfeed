"""Token-gated dev endpoint for seeding production with demo content.

The seed endpoint is idempotent-ish (deterministic RNG seed + optional wipe)
and safe to leave deployed: an unset or mismatched ``SEED_TOKEN`` returns
403 with no side effects.
"""
import os

from flask import Blueprint, jsonify, request

from ..databases import get_db_connection
from ..seed_demo import seed_all

bp = Blueprint("dev", __name__, url_prefix="/api/dev")


@bp.post("/seed")
def seed():
    expected = os.environ.get("SEED_TOKEN")
    if not expected or request.headers.get("X-Seed-Token") != expected:
        return jsonify({"error": "forbidden"}), 403
    body = request.get_json(silent=True) or {}
    wipe = bool(body.get("wipe", False))
    conn = get_db_connection()
    try:
        counts = seed_all(conn, wipe=wipe)
    finally:
        conn.close()
    return jsonify(counts)

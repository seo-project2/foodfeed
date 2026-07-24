from flask import Blueprint, jsonify

from ..databases import get_db_connection

bp = Blueprint("schools", __name__, url_prefix="/api/schools")


@bp.get("")
def list_schools():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, name, short_name, email_domain, primary_color, primary_soft, "
        "on_primary, logo_path, center_lat, center_lng FROM schools ORDER BY name ASC"
    ).fetchall()
    conn.close()
    return jsonify([_to_school(r) for r in rows])


def _to_school(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "short_name": row["short_name"],
        "email_domain": row["email_domain"],
        "primary_color": row["primary_color"],
        "primary_soft": row["primary_soft"],
        "on_primary": row["on_primary"],
        "logo_path": row["logo_path"],
        "center_lat": row["center_lat"],
        "center_lng": row["center_lng"],
    }

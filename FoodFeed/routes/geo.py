from flask import Blueprint, jsonify, request

from ..geocoding import geocode

bp = Blueprint("geo", __name__)


@bp.get("/api/geocode")
def geocode_endpoint():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"error": "q is required"}), 400
    coords = geocode(q)
    if not coords:
        return jsonify({"error": "not_found"}), 404
    lat, lng = coords
    return jsonify({"lat": lat, "lng": lng})

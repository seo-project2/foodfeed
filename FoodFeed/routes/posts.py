import base64
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from ..auth import current_user_id, require_auth
from ..config import OPENAI_API_KEY, OPENAI_MODEL, UPLOAD_DIR
from ..databases import get_db_connection
from ..geocoding import geocode
from ..matching import build_message, find_matches

bp = Blueprint("posts", __name__, url_prefix="/api/posts")

log = logging.getLogger(__name__)

MAX_SCAN_BYTES = 5 * 1024 * 1024
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

SCAN_SYSTEM_PROMPT = (
    "You are an OCR/extraction assistant. Extract these fields from a "
    "campus food flyer image. Return strict JSON with keys `title` "
    "(short, one line), `location` (building/room), `minutes` (int, how "
    "long the food will be available), `tag` (single lowercase word "
    "describing the food), `organization` (student group, department, "
    "or office hosting the event; null if not printed). Return null "
    "for any field you cannot find with confidence."
)


@bp.get("")
@require_auth
def list_posts():
    now = datetime.now(timezone.utc).isoformat()
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()

    conn = get_db_connection()
    school_id = _current_school_id(conn)
    if school_id is None:
        conn.close()
        return jsonify([])

    sql = (
        "SELECT id, title, location_text, tag, organization, lat, lng, image_url, expiry_time "
        "FROM food_posts WHERE expiry_time > ? AND school_id = ?"
    )
    params = [now, school_id]
    if q:
        sql += " AND (LOWER(title) LIKE ? OR LOWER(location_text) LIKE ?)"
        needle = f"%{q.lower()}%"
        params.extend([needle, needle])
    if tag:
        sql += " AND LOWER(tag) = ?"
        params.append(tag.lower())
    sql += " ORDER BY expiry_time ASC"

    rows = conn.execute(sql, tuple(params)).fetchall()
    reactions = _reactions_by_post(conn, [r["id"] for r in rows], current_user_id())
    conn.close()
    return jsonify([_to_feed_item(r, reactions.get(r["id"])) for r in rows])


@bp.get("/map")
@require_auth
def list_map_posts():
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    school_id = _current_school_id(conn)
    if school_id is None:
        conn.close()
        return jsonify([])
    rows = conn.execute(
        "SELECT id, title, location_text, tag, organization, lat, lng, image_url, expiry_time "
        "FROM food_posts "
        "WHERE expiry_time > ? AND school_id = ? "
        "AND lat IS NOT NULL AND lng IS NOT NULL "
        "ORDER BY expiry_time ASC",
        (now, school_id),
    ).fetchall()
    reactions = _reactions_by_post(conn, [r["id"] for r in rows], current_user_id())
    conn.close()
    return jsonify([_to_feed_item(r, reactions.get(r["id"])) for r in rows])


@bp.get("/<int:post_id>")
def get_post(post_id):
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, title, location_text, tag, organization, lat, lng, image_url, expiry_time "
        "FROM food_posts WHERE id = ?",
        (post_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "not found"}), 404
    reactions = _reactions_by_post(conn, [post_id], current_user_id())
    conn.close()
    return jsonify(_to_feed_item(row, reactions.get(post_id)))


@bp.post("/<int:post_id>/react")
@require_auth
def toggle_reaction(post_id):
    body = request.get_json(silent=True) or {}
    kind = (body.get("kind") or "").strip()
    if kind not in ("otw", "got", "late", "gone", "still"):
        return jsonify({"error": "invalid kind"}), 400
    user_id = current_user_id()

    conn = get_db_connection()
    exists = conn.execute(
        "SELECT 1 FROM food_posts WHERE id = ?", (post_id,)
    ).fetchone()
    if exists is None:
        conn.close()
        return jsonify({"error": "not found"}), 404
    existing = conn.execute(
        "SELECT id FROM post_reactions WHERE post_id = ? AND user_id = ? AND kind = ?",
        (post_id, user_id, kind),
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM post_reactions WHERE id = ?", (existing["id"],))
    else:
        conn.execute(
            "INSERT INTO post_reactions (post_id, user_id, kind) VALUES (?, ?, ?)",
            (post_id, user_id, kind),
        )
    conn.commit()
    reactions = _reactions_by_post(conn, [post_id], user_id)
    conn.close()
    return jsonify({"post_id": post_id, "reactions": reactions.get(post_id, _empty_reactions())})


@bp.post("")
@require_auth
def create_post():
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        title = (request.form.get("title") or "").strip()
        location = (request.form.get("location") or "").strip()
        minutes = request.form.get("minutes")
        tag = (request.form.get("tag") or "").strip() or None
        organization = (request.form.get("organization") or "").strip() or None
        client_lat = request.form.get("lat")
        client_lng = request.form.get("lng")
        image_file = request.files.get("image")
    else:
        body = request.get_json(silent=True) or {}
        title = (body.get("title") or "").strip()
        location = (body.get("location") or "").strip()
        minutes = body.get("minutes")
        tag = (body.get("tag") or "").strip() or None
        organization = (body.get("organization") or "").strip() or None
        client_lat = body.get("lat")
        client_lng = body.get("lng")
        image_file = None

    if not title or not location:
        return jsonify({"error": "title and location are required"}), 400
    try:
        minutes_int = int(minutes)
        if minutes_int <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "minutes must be a positive integer"}), 400

    image_url = None
    if image_file is not None and image_file.filename:
        mimetype = (image_file.mimetype or "").lower()
        if mimetype not in ALLOWED_IMAGE_TYPES:
            return jsonify({"error": "image must be JPEG, PNG, WEBP, or GIF"}), 400
        raw = image_file.read()
        if len(raw) == 0:
            return jsonify({"error": "image is empty"}), 400
        if len(raw) > MAX_UPLOAD_BYTES:
            return jsonify({"error": "image exceeds 5 MB"}), 400
        ext = EXT_BY_MIME[mimetype]
        fname = f"{uuid.uuid4().hex}{ext}"
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as fh:
            fh.write(raw)
        image_url = f"/uploads/{fname}"

    expiry = datetime.now(timezone.utc) + timedelta(minutes=minutes_int)

    lat = lng = None
    if client_lat is not None and client_lng is not None:
        try:
            lat = float(client_lat)
            lng = float(client_lng)
        except (TypeError, ValueError):
            lat = lng = None
    if lat is None or lng is None:
        coords = geocode(location)
        lat, lng = coords if coords else (None, None)
    user_id = current_user_id()

    conn = get_db_connection()
    school_id = _current_school_id(conn)
    if school_id is None:
        conn.close()
        return jsonify({"error": "join a school before posting"}), 409
    cur = conn.execute(
        "INSERT INTO food_posts (user_id, school_id, title, location_text, tag, organization, lat, lng, expiry_time, image_url) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, school_id, title, location, tag, organization, lat, lng, expiry.isoformat(), image_url),
    )
    post_id = cur.lastrowid

    conn.execute("SAVEPOINT notifs")
    try:
        matches = find_matches(
            conn,
            {"user_id": user_id, "title": title, "lat": lat, "lng": lng},
        )
        if matches:
            rows = [
                (
                    post_id,
                    m["user_id"],
                    build_message(title, m.get("keyword"), location),
                )
                for m in matches
            ]
            conn.executemany(
                "INSERT INTO notifications (post_id, user_id, message) VALUES (?, ?, ?)",
                rows,
            )
        conn.execute("RELEASE SAVEPOINT notifs")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT notifs")
        conn.execute("RELEASE SAVEPOINT notifs")
        log.exception("notification insert failed for post_id=%s", post_id)

    conn.commit()
    row = conn.execute(
        "SELECT id, title, location_text, tag, organization, lat, lng, image_url, expiry_time "
        "FROM food_posts WHERE id = ?",
        (post_id,),
    ).fetchone()
    conn.close()
    return jsonify(_to_feed_item(row)), 201


@bp.post("/scan")
@require_auth
def scan_flyer():
    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400
    image = request.files["image"]
    mimetype = image.mimetype or ""
    if not mimetype.startswith("image/"):
        return jsonify({"error": "file must be an image"}), 400
    raw = image.read()
    if len(raw) == 0:
        return jsonify({"error": "image is empty"}), 400
    if len(raw) > MAX_SCAN_BYTES:
        return jsonify({"error": "image exceeds 5 MB"}), 400

    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not configured"}), 502

    data_url = f"data:{mimetype};base64,{base64.b64encode(raw).decode('ascii')}"

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SCAN_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the fields as JSON."},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
        )
        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
    except Exception:
        log.exception("scan failed")
        return jsonify({"error": "scan failed"}), 502

    return jsonify({
        "title": parsed.get("title"),
        "location": parsed.get("location"),
        "minutes": parsed.get("minutes"),
        "tag": parsed.get("tag"),
        "organization": parsed.get("organization"),
    })


def _current_school_id(conn):
    row = conn.execute(
        "SELECT school_id FROM users WHERE id = ?", (current_user_id(),)
    ).fetchone()
    return row["school_id"] if row else None


REACTION_KINDS = ("otw", "got", "late", "gone", "still")


def _empty_reactions():
    return {kind: 0 for kind in REACTION_KINDS} | {"my": []}


def _reactions_by_post(conn, post_ids, user_id):
    """Return {post_id: {otw, got, late, gone, still, my: [...]}} for the given posts."""
    if not post_ids:
        return {}
    placeholders = ",".join("?" * len(post_ids))
    counts = conn.execute(
        f"SELECT post_id, kind, COUNT(*) AS c FROM post_reactions "
        f"WHERE post_id IN ({placeholders}) GROUP BY post_id, kind",
        tuple(post_ids),
    ).fetchall()
    mine = []
    if user_id:
        mine = conn.execute(
            f"SELECT post_id, kind FROM post_reactions "
            f"WHERE user_id = ? AND post_id IN ({placeholders})",
            (user_id, *post_ids),
        ).fetchall()
    result = {pid: _empty_reactions() for pid in post_ids}
    for row in counts:
        result[row["post_id"]][row["kind"]] = row["c"]
    for row in mine:
        result[row["post_id"]]["my"].append(row["kind"])
    return result


def _to_feed_item(row, reactions=None):
    expiry = datetime.fromisoformat(row["expiry_time"])
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    minutes_left = max(0, int((expiry - datetime.now(timezone.utc)).total_seconds() // 60))
    item = {
        "id": row["id"],
        "title": row["title"],
        "location": row["location_text"],
        "tag": row["tag"],
        "organization": row["organization"],
        "minutesLeft": minutes_left,
        "imageUrl": row["image_url"],
    }
    if row["lat"] is not None and row["lng"] is not None:
        item["lat"] = row["lat"]
        item["lng"] = row["lng"]
    r = reactions or _empty_reactions()
    item["reactions"] = r
    if r["gone"] >= 2 and r["gone"] > r["still"]:
        item["status"] = "gone"
    return item

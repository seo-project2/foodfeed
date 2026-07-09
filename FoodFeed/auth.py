from flask import request

from .databases import SEED_USER_ID


def current_user_id():
    return request.headers.get("X-User-Id") or SEED_USER_ID

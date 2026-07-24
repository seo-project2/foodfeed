import os
import secrets

from dotenv import load_dotenv

load_dotenv()


def _env(name, default=None):
    value = os.environ.get(name)
    return value if value is not None and value != "" else default


IS_DEV = _env("FLASK_ENV", "development") == "development"
IS_PRODUCTION = not IS_DEV

SECRET_KEY = _env("SECRET_KEY") or (secrets.token_hex(32) if IS_DEV else None)
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID")

ALLOWED_EMAIL_SUFFIX = ".edu"

NOMINATIM_CONTACT_EMAIL = _env("NOMINATIM_CONTACT_EMAIL", "dev@foodfeed.local")

OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-5.4-nano")

_HERE = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = _env("DATABASE_PATH", os.path.join(_HERE, "foodfeed.db"))
UPLOAD_DIR = _env("UPLOAD_DIR", os.path.join(os.path.dirname(DATABASE_PATH), "uploads"))

FRONTEND_ORIGIN = _env("FRONTEND_ORIGIN", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in FRONTEND_ORIGIN.split(",") if o.strip()]

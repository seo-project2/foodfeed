import os
import secrets

from dotenv import load_dotenv

load_dotenv()


def _env(name, default=None):
    value = os.environ.get(name)
    return value if value is not None and value != "" else default


IS_DEV = _env("FLASK_ENV", "development") == "development"

SECRET_KEY = _env("SECRET_KEY") or (secrets.token_hex(32) if IS_DEV else None)
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID")

ALLOWED_EMAIL_SUFFIX = ".edu"

NOMINATIM_CONTACT_EMAIL = _env("NOMINATIM_CONTACT_EMAIL", "dev@foodfeed.local")

OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-4o-mini")

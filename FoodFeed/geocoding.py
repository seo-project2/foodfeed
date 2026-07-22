import requests

from .config import NOMINATIM_CONTACT_EMAIL

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = f"FoodFeed/0.1 ({NOMINATIM_CONTACT_EMAIL})"

_cache: dict[str, tuple[float, float]] = {}


def _geocode_raw(text):
    if not text or not text.strip():
        return None
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"format": "json", "limit": 1, "q": text},
            headers={"User-Agent": USER_AGENT},
            timeout=2,
        )
        resp.raise_for_status()
        results = resp.json()
    except (requests.RequestException, ValueError):
        return None
    if not results:
        return None
    try:
        return float(results[0]["lat"]), float(results[0]["lon"])
    except (KeyError, TypeError, ValueError):
        return None


def geocode(text):
    """Return (lat, lng) for a location string, or None on any failure.

    Successful results are cached; None results are not, so a single Nominatim
    flake doesn't permanently poison a location string.
    """
    hit = _cache.get(text)
    if hit is not None:
        return hit
    result = _geocode_raw(text)
    if result is not None:
        _cache[text] = result
    return result

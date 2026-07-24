import requests

from .config import NOMINATIM_CONTACT_EMAIL

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = f"FoodFeed/0.1 ({NOMINATIM_CONTACT_EMAIL})"

CAMPUS_RADIUS_DEG = 0.05

_cache: dict[tuple, tuple[float, float]] = {}


def _viewbox(lat, lng, r=CAMPUS_RADIUS_DEG):
    return f"{lng - r},{lat - r},{lng + r},{lat + r}"


def _query_nominatim(params):
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params=params,
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


def geocode(text, near=None):
    """Return (lat, lng) for a location string, or None on any failure.

    When `near` (lat, lng) is provided, results are constrained to a small
    viewbox around that point so a campus building name doesn't resolve to a
    same-named place across the country. If nothing is found inside the box we
    return None rather than falling back globally — a wrong pin routes users
    to the wrong address; no pin lets them drop one manually.
    """
    if not text or not text.strip():
        return None
    key = (text.strip(), near)
    hit = _cache.get(key)
    if hit is not None:
        return hit
    params = {"format": "json", "limit": 1, "q": text}
    if near:
        lat, lng = near
        params.update({"viewbox": _viewbox(lat, lng), "bounded": 1})
    result = _query_nominatim(params)
    if result is not None:
        _cache[key] = result
    return result

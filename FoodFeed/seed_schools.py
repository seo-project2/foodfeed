"""Canonical school seed data. Idempotent."""

SCHOOLS = (
    {
        "id": "uchicago",
        "name": "University of Chicago",
        "short_name": "U Chicago",
        "email_domain": "uchicago.edu",
        "primary_color": "#800000",
        "primary_soft": "#F3E4E4",
        "on_primary": "#FFFFFF",
        "logo_path": "/schools/uchicago.svg",
        "center_lat": 41.7886,
        "center_lng": -87.5987,
    },
    {
        "id": "washu",
        "name": "Washington University in St. Louis",
        "short_name": "WashU",
        "email_domain": "wustl.edu",
        "primary_color": "#0C5C3F",
        "primary_soft": "#E4EFEA",
        "on_primary": "#FFFFFF",
        "logo_path": "/schools/washu.svg",
        "center_lat": 38.6488,
        "center_lng": -90.3108,
    },
    {
        "id": "yale",
        "name": "Yale University",
        "short_name": "Yale",
        "email_domain": "yale.edu",
        "primary_color": "#0F4D92",
        "primary_soft": "#E4EBF3",
        "on_primary": "#FFFFFF",
        "logo_path": "/schools/yale.svg",
        "center_lat": 41.3163,
        "center_lng": -72.9223,
    },
)


def seed_schools(conn):
    """INSERT OR IGNORE the canonical schools. Safe to call repeatedly."""
    conn.executemany(
        "INSERT OR IGNORE INTO schools "
        "(id, name, short_name, email_domain, primary_color, primary_soft, "
        "on_primary, logo_path, center_lat, center_lng) "
        "VALUES (:id, :name, :short_name, :email_domain, :primary_color, "
        ":primary_soft, :on_primary, :logo_path, :center_lat, :center_lng)",
        SCHOOLS,
    )

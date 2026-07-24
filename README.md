# FoodFeed

Real-time campus feed for leftover food. Snap a flyer, and OCR fills in the details.
Neighbors within a chosen radius get a live match if it hits their keyword.

- **Backend:** Flask + SQLite in `FoodFeed/`
- **Frontend:** Vite + React in `frontend/`
- **Deploy:** Render (Web Service + Static Site + 1 GB Disk) via `render.yaml`

## Features

- **OCR flyer scan** — OpenAI Vision extracts title / location / minutes / tag from a photo
- **Real-time matching** — new posts fire notifications to matching keyword+radius subscriptions
- **Notification inbox** — unread badge, click-to-view, mark-all-read
- **Feed search + tag filters** — canonical tag chips, debounced search
- **Saved posts** — bookmark a post; profile stats show your activity
- **Google Sign-In** — `.edu` gate enforced from the verified `hd` claim
- **Map view** — Leaflet + OSM tiles with custom markers, "locate me" FAB, and view-post deep links

## System diagrams

- [System architecture](docs/diagrams/architecture.md)
- [Google Sign-In sequence](docs/diagrams/auth-sequence.md)
- [Post → match → notify pipeline](docs/diagrams/post-pipeline.md)
- [Entity-relationship diagram](docs/diagrams/er.md)

## Local development

    cp .env.example .env      # fill in secrets — see below
    make install
    make init-db
    make serve                # backend on :5000

    cd frontend && npm install && npm run dev   # frontend on :5173

### Environment variables

| Var | Purpose |
|---|---|
| `SECRET_KEY` | Flask session cookie signing. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `OPENAI_API_KEY` | Used by `POST /api/posts/scan` (OpenAI Vision) |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini` |
| `NOMINATIM_CONTACT_EMAIL` | Contact email advertised to Nominatim (required by their policy) |
| `DATABASE_PATH` | SQLite file path. Defaults to `FoodFeed/foodfeed.db` locally; `/data/foodfeed.db` on Render |
| `UPLOAD_DIR` | Flyer photo directory. Defaults to `<db-dir>/uploads` |
| `FRONTEND_ORIGIN` | Comma-separated list of allowed CORS origins. Defaults to `http://localhost:5173` |
| `FLASK_ENV` | `development` (default) or `production`. Production is stricter (requires `SECRET_KEY`, secure cookies, no `X-User-Id` fallback). |

`VITE_API_BASE` and `VITE_GOOGLE_CLIENT_ID` control the frontend at build/runtime.

### Setting up Google Sign-In

1. Google Cloud Console → APIs & Services → Credentials.
2. Create OAuth 2.0 Client ID, type **Web application**.
3. Add authorized JavaScript origins: `http://localhost:5173` plus your deployed frontend URL.
4. Copy the client ID into `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend).

Only `.edu` email addresses are accepted (server-side, via the Google-verified email claim).

## HTTP endpoints

    # Posts
    GET    /api/posts[?q=&tag=]      # public
    GET    /api/posts/map            # public
    GET    /api/posts/<id>           # public
    POST   /api/posts                # auth — multipart/form-data or JSON
    POST   /api/posts/scan           # auth — multipart, OpenAI Vision

    # Subscriptions
    GET    /api/subscriptions        # auth
    POST   /api/subscriptions        # auth
    DELETE /api/subscriptions/<id>   # auth (soft-delete)

    # Notifications
    GET    /api/notifications              # auth
    PATCH  /api/notifications/<id>/read    # auth
    POST   /api/notifications/read_all     # auth

    # Saved
    POST   /api/posts/<id>/save      # auth
    DELETE /api/posts/<id>/save      # auth
    GET    /api/me/saved             # auth

    # Auth / me
    POST   /api/auth/google
    POST   /api/auth/logout
    GET    /api/me

    # Static
    GET    /uploads/<filename>       # user-uploaded flyer photos

## Deploy to Render

`render.yaml` at the repo root defines both services and a 1 GB disk mounted at `/data`.

1. Push to GitHub.
2. Render → New → Blueprint → point at this repo.
3. Set the `sync: false` env vars in the dashboard:
   - `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `NOMINATIM_CONTACT_EMAIL`, `FRONTEND_ORIGIN`
   - Static site: `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID`
4. Add both Render URLs to Google Cloud Console authorized origins.

## Attribution

Geocoding uses the OpenStreetMap Nominatim service.
© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), data
subject to the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

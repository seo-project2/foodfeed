# FoodFeed

Backend: Flask + SQLite in `FoodFeed/`. Frontend: Vite + React in `frontend/`.

## Backend dev

    cp .env.example .env      # fill in secrets — see below
    make install
    make init-db
    make serve                # listens on :5000

Endpoints:

- `GET /api/posts`, `POST /api/posts`
- `GET /api/subscriptions`, `POST /api/subscriptions`, `DELETE /api/subscriptions/<id>`
- `POST /api/auth/google`, `POST /api/auth/logout`
- `GET /api/me`

### Environment variables

Set in `.env` at the repo root (loaded via `python-dotenv`).

| Var | Purpose |
|---|---|
| `SECRET_KEY` | Flask session cookie signing. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID — see below |
| `FLASK_ENV` | `development` (default) enables `X-User-Id` header fallback for curl testing |

### Setting up Google Sign-In

1. Go to Google Cloud Console → APIs & Services → Credentials.
2. Create OAuth 2.0 Client ID, application type **Web application**.
3. Add authorized JavaScript origin `http://localhost:5173`.
4. Copy the client ID into `GOOGLE_CLIENT_ID` in `.env`.

Only email addresses in the `wustl.edu` domain are accepted (enforced via the
Google `hd` claim).

## Frontend dev

    cd frontend && npm install && npm run dev

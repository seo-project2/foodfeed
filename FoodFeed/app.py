import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from .config import ALLOWED_ORIGINS, IS_PRODUCTION, SECRET_KEY, UPLOAD_DIR
from .databases import ensure_schema
from .routes.auth import bp as auth_bp
from .routes.me import bp as me_bp
from .routes.notifications import bp as notifications_bp
from .routes.posts import bp as posts_bp
from .routes.saved import bp as saved_bp
from .routes.subscriptions import bp as subscriptions_bp


def create_app():
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set outside development")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ensure_schema()

    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    if IS_PRODUCTION:
        app.config.update(
            SESSION_COOKIE_SECURE=True,
            SESSION_COOKIE_SAMESITE="None",
            SESSION_COOKIE_HTTPONLY=True,
        )
    CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
    app.register_blueprint(posts_bp)
    app.register_blueprint(subscriptions_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(me_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(saved_bp)

    @app.get("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(UPLOAD_DIR, filename)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=not IS_PRODUCTION)

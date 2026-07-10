from flask import Flask
from flask_cors import CORS

from .config import SECRET_KEY
from .routes.auth import bp as auth_bp
from .routes.me import bp as me_bp
from .routes.posts import bp as posts_bp
from .routes.subscriptions import bp as subscriptions_bp


def create_app():
    app = Flask(__name__)
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set outside development")
    app.secret_key = SECRET_KEY
    CORS(app, origins=["http://localhost:5173"], supports_credentials=True)
    app.register_blueprint(posts_bp)
    app.register_blueprint(subscriptions_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(me_bp)
    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000, debug=True)

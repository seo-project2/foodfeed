from flask import Flask
from flask_cors import CORS

from .routes.posts import bp as posts_bp


def create_app():
    app = Flask(__name__)
    CORS(app, origins=["http://localhost:5173"])
    app.register_blueprint(posts_bp)
    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000, debug=True)

from flask import Flask

from .routes import main_blueprint


def create_app():
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    app.config["SECRET_KEY"] = "solar-tracker-dev-key"
    app.register_blueprint(main_blueprint)
    return app

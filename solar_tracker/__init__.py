from flask import Flask

from .routes import main_blueprint
from .sunrun_production import ensure_sunrun_production_date
from .time_utils import tracker_today


def create_app():
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    app.config["SECRET_KEY"] = "solar-tracker-dev-key"
    app.register_blueprint(main_blueprint)

    def ensure_current_sunrun_row() -> None:
        try:
            ensure_sunrun_production_date(tracker_today())
        except (OSError, ValueError) as error:
            app.logger.warning("Could not initialize today's SunRun production row: %s", error)

    ensure_current_sunrun_row()
    app.before_request(ensure_current_sunrun_row)
    return app

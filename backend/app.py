from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

from extensions import db

from routes.auth import auth
from routes.products import products
from routes.offers import offers
from routes.users import users
from routes.scraper import scraper
from routes.live_search import live_search_bp


# Load variables from .env
load_dotenv()


def create_app():
    app = Flask(__name__)
    CORS(app)

    # =========================
    # Database Configuration
    # =========================
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        "mysql+pymysql://root:Tejas%404041@localhost/smartbuy"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # =========================
    # JWT Configuration
    # =========================
    app.config["JWT_SECRET_KEY"] = "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET"
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * 24

    # =========================
    # Extensions
    # =========================
    CORS(app)
    db.init_app(app)
    JWTManager(app)

    # =========================
    # Import Models
    # =========================
    # Models must be imported before db.create_all()

    from models.user import User
    from models.product import Product
    from models.offer import Offer
    from models.price_history import PriceHistory
    from models.watchlist import Watchlist
    from models.search_history import SearchHistory

    # =========================
    # Register Blueprints
    # =========================

    app.register_blueprint(auth)
    app.register_blueprint(products)
    app.register_blueprint(offers)
    app.register_blueprint(users)
    app.register_blueprint(scraper)
    app.register_blueprint(live_search_bp)

    # =========================
    # Health Check
    # =========================

    @app.get("/api/health")
    def health():
        return {
            "status": "SmartBuy backend is running"
        }

    # =========================
    # Database Test
    # =========================

    @app.get("/api/db-test")
    def db_test():
        try:
            db.session.execute(db.text("SELECT 1"))

            return {
                "database": "connected"
            }

        except Exception as e:
            db.session.rollback()

            return {
                "database": "connection failed",
                "error": str(e)
            }, 500

    # =========================
    # Create Database Tables
    # =========================

    with app.app_context():
        db.create_all()

    return app


# =========================
# Create Flask Application
# =========================

app = create_app()


# =========================
# Run Application
# =========================

if __name__ == "__main__":
    app.run(debug=True)
from flask import Flask
from flask_cors import CORS

from extensions import db
from models.user import User
from routes.auth import auth

app = Flask(__name__)
CORS(app)

# MySQL configuration
app.config["SQLALCHEMY_DATABASE_URI"] = "mysql+pymysql://root:Tejas%404041@localhost/smartbuy"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

app.register_blueprint(auth)


@app.route("/api/health")
def health():
    return {"status": "SmartBuy backend is running"}


@app.route("/api/db-test")
def db_test():
    try:
        db.session.execute(db.text("SELECT 1"))
        return {"database": "connected"}
    except Exception as e:
        return {"database": "connection failed", "error": str(e)}, 500


with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(debug=True)
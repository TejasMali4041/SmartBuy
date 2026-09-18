from datetime import datetime
from extensions import db

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    watchlist = db.relationship(
        "Watchlist", back_populates="user", cascade="all, delete-orphan"
    )
    searches = db.relationship(
        "SearchHistory", back_populates="user", cascade="all, delete-orphan"
    )

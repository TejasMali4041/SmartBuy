from datetime import datetime
from extensions import db

class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    normalized_name = db.Column(db.String(255), nullable=False, index=True)
    brand = db.Column(db.String(120), nullable=True)
    category = db.Column(db.String(120), nullable=True)
    model_number = db.Column(db.String(150), nullable=True, index=True)
    image_url = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    offers = db.relationship(
        "Offer", back_populates="product", cascade="all, delete-orphan"
    )
    watchlist_items = db.relationship(
        "Watchlist", back_populates="product", cascade="all, delete-orphan"
    )

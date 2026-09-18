from datetime import datetime
from extensions import db

class Offer(db.Model):
    __tablename__ = "offers"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    platform = db.Column(db.String(50), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    url = db.Column(db.Text, nullable=False)
    price = db.Column(db.Numeric(12, 2), nullable=False)
    original_price = db.Column(db.Numeric(12, 2), nullable=True)
    rating = db.Column(db.Float, nullable=True)
    review_count = db.Column(db.Integer, nullable=True, default=0)
    seller_name = db.Column(db.String(150), nullable=True)
    seller_rating = db.Column(db.Float, nullable=True)
    availability = db.Column(db.String(80), nullable=True)
    delivery_text = db.Column(db.String(255), nullable=True)
    offer_text = db.Column(db.String(255), nullable=True)
    last_checked = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    product = db.relationship("Product", back_populates="offers")
    price_history = db.relationship(
        "PriceHistory", back_populates="offer", cascade="all, delete-orphan"
    )

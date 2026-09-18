from datetime import datetime
from extensions import db

class Watchlist(db.Model):
    __tablename__ = "watchlist"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    target_price = db.Column(db.Numeric(12, 2), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = db.relationship("User", back_populates="watchlist")
    product = db.relationship("Product", back_populates="watchlist_items")

    __table_args__ = (
        db.UniqueConstraint("user_id", "product_id", name="uq_user_product_watchlist"),
    )

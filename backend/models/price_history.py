from datetime import datetime
from extensions import db

class PriceHistory(db.Model):
    __tablename__ = "price_history"

    id = db.Column(db.Integer, primary_key=True)
    offer_id = db.Column(
        db.Integer, db.ForeignKey("offers.id"), nullable=False, index=True
    )
    price = db.Column(db.Numeric(12, 2), nullable=False)
    recorded_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    offer = db.relationship("Offer", back_populates="price_history")

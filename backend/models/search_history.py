from datetime import datetime
from extensions import db

class SearchHistory(db.Model):
    __tablename__ = "search_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    query = db.Column(db.String(255), nullable=False)
    searched_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    user = db.relationship("User", back_populates="searches")

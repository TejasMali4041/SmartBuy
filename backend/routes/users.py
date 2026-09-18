from decimal import Decimal
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from extensions import db
from models.product import Product
from models.watchlist import Watchlist
from routes.products import product_to_dict

users = Blueprint("users", __name__)

@users.get("/api/watchlist")
@jwt_required()
def get_watchlist():
    user_id = int(get_jwt_identity())

    items = Watchlist.query.filter_by(user_id=user_id).all()

    return {
        "watchlist": [
            {
                "id": item.id,
                "target_price": float(item.target_price) if item.target_price is not None else None,
                "created_at": item.created_at.isoformat(),
                "product": product_to_dict(item.product, include_offers=True)
            }
            for item in items
        ]
    }


@users.post("/api/watchlist/<int:product_id>")
@jwt_required()
def add_watchlist(product_id):
    user_id = int(get_jwt_identity())

    product = db.session.get(Product, product_id)
    if not product:
        return {"message": "Product not found"}, 404

    existing = Watchlist.query.filter_by(
        user_id=user_id,
        product_id=product_id
    ).first()

    if existing:
        return {"message": "Product already in watchlist"}, 409

    data = request.get_json(silent=True) or {}
    target_price = data.get("target_price")

    if target_price is not None:
        try:
            target_price = Decimal(str(target_price))
        except Exception:
            return {"message": "Invalid target price"}, 400

    item = Watchlist(
        user_id=user_id,
        product_id=product_id,
        target_price=target_price
    )

    db.session.add(item)
    db.session.commit()

    return {
        "message": "Product added to watchlist",
        "watchlist_id": item.id
    }, 201


@users.delete("/api/watchlist/<int:product_id>")
@jwt_required()
def remove_watchlist(product_id):
    user_id = int(get_jwt_identity())

    item = Watchlist.query.filter_by(
        user_id=user_id,
        product_id=product_id
    ).first()

    if not item:
        return {"message": "Product not in watchlist"}, 404

    db.session.delete(item)
    db.session.commit()

    return {"message": "Product removed from watchlist"}

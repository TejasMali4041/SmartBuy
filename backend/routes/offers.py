from datetime import datetime
from decimal import Decimal
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from extensions import db
from models.product import Product
from models.offer import Offer
from models.price_history import PriceHistory
from routes.products import offer_to_dict

offers = Blueprint("offers", __name__)

@offers.get("/api/products/<int:product_id>/offers")
def get_offers(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return {"message": "Product not found"}, 404

    return {
        "product_id": product.id,
        "offers": [offer_to_dict(o) for o in sorted(product.offers, key=lambda x: Decimal(x.price))]
    }


@offers.post("/api/products/<int:product_id>/offers")
@jwt_required()
def add_offer(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return {"message": "Product not found"}, 404

    data = request.get_json(silent=True) or {}

    required = ["platform", "title", "url", "price"]
    if any(data.get(field) in (None, "") for field in required):
        return {"message": "platform, title, url and price are required"}, 400

    try:
        price = Decimal(str(data["price"]))
    except Exception:
        return {"message": "Invalid price"}, 400

    if price < 0:
        return {"message": "Price cannot be negative"}, 400

    offer = Offer(
        product_id=product.id,
        platform=str(data["platform"]).strip(),
        title=str(data["title"]).strip(),
        url=str(data["url"]).strip(),
        price=price,
        original_price=data.get("original_price"),
        rating=data.get("rating"),
        review_count=data.get("review_count", 0),
        seller_name=data.get("seller_name"),
        seller_rating=data.get("seller_rating"),
        availability=data.get("availability"),
        delivery_text=data.get("delivery_text"),
        offer_text=data.get("offer_text"),
        last_checked=datetime.utcnow(),
    )

    db.session.add(offer)
    db.session.flush()

    db.session.add(
        PriceHistory(
            offer_id=offer.id,
            price=price
        )
    )

    db.session.commit()

    return {
        "message": "Offer added",
        "offer": offer_to_dict(offer)
    }, 201


@offers.put("/api/offers/<int:offer_id>")
@jwt_required()
def update_offer(offer_id):
    offer = db.session.get(Offer, offer_id)

    if not offer:
        return {"message": "Offer not found"}, 404

    data = request.get_json(silent=True) or {}

    if "price" in data:
        try:
            new_price = Decimal(str(data["price"]))
        except Exception:
            return {"message": "Invalid price"}, 400

        if new_price < 0:
            return {"message": "Price cannot be negative"}, 400

        offer.price = new_price

        db.session.add(
            PriceHistory(
                offer_id=offer.id,
                price=new_price
            )
        )

    fields = [
        "title", "url", "original_price", "rating", "review_count",
        "seller_name", "seller_rating", "availability",
        "delivery_text", "offer_text"
    ]

    for field in fields:
        if field in data:
            setattr(offer, field, data[field])

    if "platform" in data:
        offer.platform = str(data["platform"]).strip()

    offer.last_checked = datetime.utcnow()

    db.session.commit()

    return {
        "message": "Offer updated",
        "offer": offer_to_dict(offer)
    }


@offers.get("/api/offers/<int:offer_id>/history")
def price_history(offer_id):
    offer = db.session.get(Offer, offer_id)

    if not offer:
        return {"message": "Offer not found"}, 404

    history = PriceHistory.query.filter_by(
        offer_id=offer_id
    ).order_by(PriceHistory.recorded_at.asc()).all()

    return {
        "offer_id": offer_id,
        "history": [
            {
                "price": float(item.price),
                "recorded_at": item.recorded_at.isoformat()
            }
            for item in history
        ]
    }

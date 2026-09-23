from datetime import datetime
from decimal import Decimal
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, verify_jwt_in_request, get_jwt_identity
from extensions import db
from models.product import Product
from models.offer import Offer
from models.price_history import PriceHistory
from models.watchlist import Watchlist
from services.normalizer import normalize_product_name
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


@offers.get("/api/products/<int:product_id>/history")
def product_price_history(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return {"message": "Product not found"}, 404

    offers_data = []
    all_prices = []

    for o in product.offers:
        history = (
            PriceHistory.query.filter_by(offer_id=o.id)
            .order_by(PriceHistory.recorded_at.asc())
            .all()
        )
        points = [
            {
                "price": float(item.price),
                "recorded_at": item.recorded_at.isoformat(),
            }
            for item in history
        ]
        if not points and o.price is not None:
            # Fallback point for current price if history empty
            points.append({
                "price": float(o.price),
                "recorded_at": (o.last_checked or datetime.utcnow()).isoformat(),
            })

        for p in points:
            all_prices.append(p["price"])

        offers_data.append({
            "offer_id": o.id,
            "platform": o.platform,
            "title": o.title,
            "url": o.url,
            "current_price": float(o.price) if o.price is not None else None,
            "original_price": float(o.original_price) if o.original_price is not None else None,
            "history": points,
        })

    lowest_price = min(all_prices) if all_prices else None
    highest_price = max(all_prices) if all_prices else None
    avg_price = (sum(all_prices) / len(all_prices)) if all_prices else None

    return {
        "product_id": product.id,
        "product_name": product.name,
        "brand": product.brand,
        "image_url": product.image_url,
        "lowest_price": lowest_price,
        "highest_price": highest_price,
        "average_price": round(avg_price, 2) if avg_price else None,
        "offers": offers_data,
    }


@offers.post("/api/products/track-live")
def track_live_product():
    """
    Saves a live-scraped product into the database and records its Day 1 price history.
    Optionally registers target_price into user watchlist if authenticated.
    """
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return {"message": "Product name is required"}, 400

    brand = data.get("brand")
    category = data.get("category")
    image_url = data.get("image_url")
    offers_list = data.get("offers", [])
    target_price = data.get("target_price")

    norm_name = normalize_product_name(name)
    product = Product.query.filter_by(normalized_name=norm_name).first()

    if not product:
        product = Product(
            name=name,
            normalized_name=norm_name,
            brand=brand,
            category=category,
            image_url=image_url,
        )
        db.session.add(product)
        db.session.flush()

    # Track / create offers and initial price history
    for o_data in offers_list:
        plat = str(o_data.get("platform", "Store")).strip()
        price_val = o_data.get("price")
        if price_val is None:
            continue
        try:
            dec_price = Decimal(str(price_val))
        except Exception:
            continue

        existing_offer = Offer.query.filter_by(product_id=product.id, platform=plat).first()
        if not existing_offer:
            existing_offer = Offer(
                product_id=product.id,
                platform=plat,
                title=str(o_data.get("title", name)).strip(),
                url=str(o_data.get("url", "")).strip(),
                price=dec_price,
                original_price=Decimal(str(o_data["original_price"])) if o_data.get("original_price") else None,
                rating=o_data.get("rating"),
                review_count=o_data.get("review_count", 0),
                seller_name=o_data.get("seller_name"),
                seller_rating=o_data.get("seller_rating"),
                availability=o_data.get("availability"),
                delivery_text=o_data.get("delivery_text"),
                offer_text=o_data.get("offer_text"),
                last_checked=datetime.utcnow(),
            )
            db.session.add(existing_offer)
            db.session.flush()

            # Record Day 1 price history
            db.session.add(PriceHistory(offer_id=existing_offer.id, price=dec_price))
        else:
            existing_offer.price = dec_price
            existing_offer.last_checked = datetime.utcnow()
            # If no price history exists for this offer, add Day 1
            if PriceHistory.query.filter_by(offer_id=existing_offer.id).count() == 0:
                db.session.add(PriceHistory(offer_id=existing_offer.id, price=dec_price))

    # Optional watchlist registration
    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        jwt_id = get_jwt_identity()
        if jwt_id:
            user_id = int(jwt_id)
    except Exception:
        pass

    if user_id:
        existing_w = Watchlist.query.filter_by(user_id=user_id, product_id=product.id).first()
        dec_target = None
        if target_price:
            try:
                dec_target = Decimal(str(target_price))
            except Exception:
                pass
        if not existing_w:
            w_item = Watchlist(user_id=user_id, product_id=product.id, target_price=dec_target)
            db.session.add(w_item)
        elif dec_target:
            existing_w.target_price = dec_target

    db.session.commit()

    return {
        "message": "Product tracking initialized in database",
        "product_id": product.id,
        "name": product.name,
        "offers_tracked": len(product.offers),
    }, 201



from decimal import Decimal

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request

from extensions import db
from models.product import Product
from models.offer import Offer
from models.search_history import SearchHistory
from services.normalizer import normalize_product_name
from services.recommendation import calculate_offer_score


products = Blueprint("products", __name__)


def offer_to_dict(offer):
    return {
        "id": offer.id,
        "platform": offer.platform,
        "title": offer.title,
        "url": offer.url,
        "price": float(offer.price),
        "original_price": (
            float(offer.original_price)
            if offer.original_price is not None
            else None
        ),
        "rating": offer.rating,
        "review_count": offer.review_count,
        "seller_name": offer.seller_name,
        "seller_rating": offer.seller_rating,
        "availability": offer.availability,
        "delivery_text": offer.delivery_text,
        "offer_text": offer.offer_text,
        "last_checked": (
            offer.last_checked.isoformat()
            if offer.last_checked
            else None
        ),
    }


def product_to_dict(product, include_offers=False):
    data = {
        "id": product.id,
        "name": product.name,
        "brand": product.brand,
        "category": product.category,
        "model_number": product.model_number,
        "image_url": product.image_url,
        "description": product.description,
        "created_at": (
            product.created_at.isoformat()
            if product.created_at
            else None
        ),
        "updated_at": (
            product.updated_at.isoformat()
            if product.updated_at
            else None
        ),
    }

    if include_offers:
        offers = sorted(
            product.offers,
            key=lambda x: Decimal(x.price)
        )
        data["offers"] = [offer_to_dict(o) for o in offers]

    return data


@products.get("/api/products")
def list_products():
    query = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    limit = min(
        max(request.args.get("limit", 20, type=int), 1),
        100
    )

    q = Product.query

    if query:
        normalized = normalize_product_name(query)
        q = q.filter(
            db.or_(
                Product.name.ilike(f"%{query}%"),
                Product.normalized_name.ilike(f"%{normalized}%"),
                Product.brand.ilike(f"%{query}%"),
                Product.model_number.ilike(f"%{query}%"),
            )
        )

    if category:
        q = q.filter(
            Product.category.ilike(f"%{category}%")
        )

    products_list = (
        q.order_by(Product.updated_at.desc())
        .limit(limit)
        .all()
    )

    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()

        if user_id and query:
            db.session.add(
                SearchHistory(
                    user_id=int(user_id),
                    query=query
                )
            )
            db.session.commit()

    except Exception:
        db.session.rollback()

    return {
        "count": len(products_list),
        "products": [
            product_to_dict(p)
            for p in products_list
        ],
    }


@products.get("/api/products/<int:product_id>")
def get_product(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return {"message": "Product not found"}, 404

    return {
        "product": product_to_dict(
            product,
            include_offers=True
        )
    }


@products.post("/api/products")
@jwt_required()
def create_product():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()

    if not name:
        return {
            "message": "Product name is required"
        }, 400

    product = Product(
        name=name,
        normalized_name=normalize_product_name(name),
        brand=data.get("brand"),
        category=data.get("category"),
        model_number=data.get("model_number"),
        image_url=data.get("image_url"),
        description=data.get("description"),
    )

    db.session.add(product)
    db.session.commit()

    return {
        "message": "Product created",
        "product": product_to_dict(product),
    }, 201


@products.get("/api/compare")
def compare():
    query = request.args.get("q", "").strip()

    if not query:
        return {
            "message": "Search query is required"
        }, 400

    normalized = normalize_product_name(query)

    matches = Product.query.filter(
        db.or_(
            Product.name.ilike(f"%{query}%"),
            Product.normalized_name.ilike(f"%{normalized}%"),
            Product.brand.ilike(f"%{query}%"),
            Product.model_number.ilike(f"%{query}%"),
        )
    ).all()

    result = []

    for product in matches:
        offers = sorted(
            product.offers,
            key=lambda o: calculate_offer_score(o),
            reverse=True
        )

        result.append({
            **product_to_dict(product),
            "offers": [
                offer_to_dict(o)
                for o in offers
            ],
        })

    return {
        "query": query,
        "products": result,
    }


@products.get("/api/recommendations")
def recommendations():
    query = request.args.get("q", "").strip()

    if not query:
        return {
            "message": "Search query is required"
        }, 400

    normalized = normalize_product_name(query)

    matches = Product.query.filter(
        db.or_(
            Product.name.ilike(f"%{query}%"),
            Product.normalized_name.ilike(f"%{normalized}%"),
            Product.brand.ilike(f"%{query}%"),
            Product.model_number.ilike(f"%{query}%"),
        )
    ).all()

    recommendations_list = []

    for product in matches:
        for offer in product.offers:
            score = calculate_offer_score(offer)

            recommendations_list.append({
                "product": product_to_dict(product),
                "offer": offer_to_dict(offer),
                "recommendation_score": round(score, 2),
            })

    recommendations_list.sort(
        key=lambda x: x["recommendation_score"],
        reverse=True
    )

    return {
        "query": query,
        "recommendations": recommendations_list[:20],
    }


# IMPORTANT:
# The old /api/search/live route has intentionally been removed.
# Live cross-platform search is handled only by routes/live_search.py.

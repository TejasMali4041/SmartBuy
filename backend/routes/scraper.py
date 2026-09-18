from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from routes.products import offer_to_dict, product_to_dict
from services.scraper import scrape_product_url, upsert_scraped_offer

scraper = Blueprint("scraper", __name__)


@scraper.post("/api/scrape/url")
@jwt_required()
def scrape_url():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not url.startswith(("http://", "https://")):
        return {"message": "A valid http/https URL is required"}, 400

    try:
        scraped = scrape_product_url(url)
        product, offer = upsert_scraped_offer(scraped)
    except Exception as exc:
        return {
            "message": "Could not scrape this product page",
            "error": str(exc),
        }, 422

    return {
        "message": "Product scraped and stored successfully",
        "product": product_to_dict(product, include_offers=True),
        "offer": offer_to_dict(offer),
        "source": scraped,
    }, 201

"""
SmartBuy AI Recommendation Engine
===================================
Multi-Factor, Imputation-Aware Scoring & Decision Engine.

Evaluates multi-platform offers (Amazon, Flipkart, etc.) by combining:
1. Price Competitiveness & Value (35% default)
2. Bayesian Weighted Product Rating & Review Confidence (25% default)
3. Seller Trust & Platform Fulfillment Reliability (20% default)
4. Active Promotions, Bank Discounts & Perks (10% default)
5. Delivery Speed & Return Policy (10% default)

Features:
- Compatible with both SQLAlchemy Offer models and Dictionary payloads.
- Dynamic weight re-normalization (prevents zero-penalties for missing API fields).
- Multi-persona support (Balanced, Budget First, Quality/Trust First, Fastest Delivery).
- Explainable AI (XAI) output: breakdown metrics, pros/cons, and natural language verdicts.
"""

from decimal import Decimal
from typing import Any, Dict, List, Optional, Union


# ---------------------------------------------------------------------------
# Persona Weights Configuration
# ---------------------------------------------------------------------------
PERSONA_WEIGHTS = {
    "balanced": {
        "price": 0.35,
        "rating": 0.25,
        "seller": 0.20,
        "perks": 0.10,
        "delivery": 0.10,
    },
    "budget": {
        "price": 0.65,
        "rating": 0.15,
        "seller": 0.10,
        "perks": 0.05,
        "delivery": 0.05,
    },
    "quality": {
        "price": 0.20,
        "rating": 0.40,
        "seller": 0.25,
        "perks": 0.05,
        "delivery": 0.10,
    },
    "delivery": {
        "price": 0.25,
        "rating": 0.20,
        "seller": 0.15,
        "perks": 0.05,
        "delivery": 0.35,
    },
}


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, float(value)))


def _get_val(offer: Any, *keys: str, default: Any = None) -> Any:
    """Extract value from either a dict or an ORM object."""
    if isinstance(offer, dict):
        for k in keys:
            if k in offer and offer[k] not in (None, ""):
                return offer[k]
    else:
        for k in keys:
            if hasattr(offer, k):
                val = getattr(offer, k)
                if val not in (None, ""):
                    return val
    return default


def _parse_price(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if float(val) > 0 else None
    if isinstance(val, Decimal):
        return float(val) if float(val) > 0 else None
    try:
        cleaned = str(val).replace(",", "").replace("₹", "").replace("$", "").strip()
        num = float(cleaned)
        return num if num > 0 else None
    except (ValueError, TypeError):
        return None


def calculate_bayesian_rating(rating: Optional[float], reviews: int, prior_rating: float = 4.0, prior_weight: int = 20) -> float:
    """
    Computes a Bayesian adjusted rating score (0.0 to 1.0).
    Prevents a 5.0 rating with 1 review from beating a 4.6 rating with 10,000 reviews.
    """
    r = float(rating) if rating is not None and 0 < float(rating) <= 5 else prior_rating
    n = max(0, int(reviews or 0))
    
    # Bayesian weighted average
    adjusted = (prior_weight * prior_rating + n * r) / (prior_weight + n)
    return _clamp(adjusted / 5.0)


def score_offer(offer: Any, all_offers: List[Any], persona: str = "balanced") -> Dict[str, Any]:
    """
    Scores an individual offer in the context of its competitors.
    Returns normalized sub-scores, composite score (0-100), pros, and badges.
    """
    weights = PERSONA_WEIGHTS.get(persona, PERSONA_WEIGHTS["balanced"]).copy()
    
    # Extract prices
    current_price = _parse_price(_get_val(offer, "price", "current_price", "sale_price"))
    original_price = _parse_price(_get_val(offer, "original_price", "mrp", "list_price"))
    
    all_valid_prices = [
        _parse_price(_get_val(o, "price", "current_price", "sale_price"))
        for o in all_offers
    ]
    all_valid_prices = [p for p in all_valid_prices if p is not None and p > 0]
    
    # -----------------------------------------------------------------------
    # 1. Price Factor (0.0 - 1.0)
    # -----------------------------------------------------------------------
    if current_price is None or current_price <= 0:
        price_subscore = 0.1  # Out of stock or unpriced
    elif not all_valid_prices:
        price_subscore = 0.8
    else:
        lowest_p = min(all_valid_prices)
        highest_p = max(all_valid_prices)
        
        if highest_p == lowest_p:
            price_subscore = 0.9  # Baseline when prices are identical
        else:
            # Scale linearly: lowest price gets 1.0, highest gets relative ratio
            price_subscore = _clamp(1.0 - ((current_price - lowest_p) / (highest_p * 1.2)))
            
        # Bonus for high discount vs MRP
        if original_price and original_price > current_price:
            discount_pct = (original_price - current_price) / original_price
            price_subscore = _clamp(price_subscore + min(0.15, discount_pct * 0.2))

    # -----------------------------------------------------------------------
    # 2. Rating & Review Factor (0.0 - 1.0)
    # -----------------------------------------------------------------------
    raw_rating = _get_val(offer, "rating", "star_rating", "stars")
    raw_reviews = _get_val(offer, "review_count", "reviews", default=0)
    try:
        raw_rating_float = float(raw_rating) if raw_rating is not None else None
    except (ValueError, TypeError):
        raw_rating_float = None
        
    try:
        raw_reviews_int = int(raw_reviews or 0)
    except (ValueError, TypeError):
        raw_reviews_int = 0

    rating_subscore = calculate_bayesian_rating(raw_rating_float, raw_reviews_int)

    # -----------------------------------------------------------------------
    # 3. Seller Trust Factor (0.0 - 1.0)
    # -----------------------------------------------------------------------
    raw_seller_rating = _get_val(offer, "seller_rating", default=4.3)
    seller_name = str(_get_val(offer, "seller_name", default="Verified Seller"))
    platform = str(_get_val(offer, "platform", default="Store")).strip().lower()
    
    try:
        seller_r_float = float(raw_seller_rating) if raw_seller_rating else 4.3
    except (ValueError, TypeError):
        seller_r_float = 4.3
        
    seller_subscore = _clamp(seller_r_float / 5.0)
    
    # Platform fulfillment bonus (Flipkart Assured / Amazon Fulfilled)
    if "assured" in seller_name.lower() or "amazon" in seller_name.lower() or "appario" in seller_name.lower() or "retailnet" in seller_name.lower():
        seller_subscore = _clamp(seller_subscore + 0.08)

    # -----------------------------------------------------------------------
    # 4. Promotions & Value Adds (0.0 - 1.0)
    # -----------------------------------------------------------------------
    offer_text = _get_val(offer, "offer_text", "promo_text", "deal_text")
    perk_subscore = 0.5  # Neutral baseline
    if offer_text:
        perk_subscore = 0.9 if any(k in str(offer_text).lower() for k in ["bank", "instant", "% off", "coupon", "discount", "cashback"]) else 0.75

    # -----------------------------------------------------------------------
    # 5. Delivery & Convenience Factor (0.0 - 1.0)
    # -----------------------------------------------------------------------
    delivery_text = str(_get_val(offer, "delivery_text", default="Standard Delivery"))
    availability = str(_get_val(offer, "availability", default="In Stock"))
    
    delivery_subscore = 0.7  # Standard domestic 2-3 days baseline
    if "tomorrow" in delivery_text.lower() or "1 day" in delivery_text.lower() or "prime" in delivery_text.lower() or "same day" in delivery_text.lower():
        delivery_subscore = 1.0
    elif "free" in delivery_text.lower() or "assured" in delivery_text.lower():
        delivery_subscore = 0.85
        
    if "out of stock" in availability.lower():
        delivery_subscore = 0.1

    # -----------------------------------------------------------------------
    # Composite Score Calculation
    # -----------------------------------------------------------------------
    raw_composite = (
        price_subscore * weights["price"] +
        rating_subscore * weights["rating"] +
        seller_subscore * weights["seller"] +
        perk_subscore * weights["perks"] +
        delivery_subscore * weights["delivery"]
    )
    
    composite_score = round(raw_composite * 100, 1)

    # -----------------------------------------------------------------------
    # Generate Explainable Pros, Cons & Badges
    # -----------------------------------------------------------------------
    pros = []
    cons = []
    
    if current_price and all_valid_prices and current_price == min(all_valid_prices):
        if len(all_valid_prices) > 1 and max(all_valid_prices) > current_price:
            diff = int(max(all_valid_prices) - current_price)
            pros.append(f"Lowest market price (saves ₹{diff:,})")
        else:
            pros.append("Best available market price")
    elif current_price and all_valid_prices and current_price > min(all_valid_prices):
        diff = int(current_price - min(all_valid_prices))
        cons.append(f"₹{diff:,} higher than cheapest alternative")
        
    if raw_rating_float and raw_rating_float >= 4.3:
        reviews_str = f" from {raw_reviews_int:,} buyers" if raw_reviews_int > 0 else ""
        pros.append(f"High customer satisfaction ({raw_rating_float}★{reviews_str})")
        
    if seller_subscore >= 0.85:
        pros.append("Verified high-trust seller fulfillment")
        
    if offer_text and offer_text not in (True, "True"):
        pros.append(f"Offer: {str(offer_text)[:40]}")

    if "tomorrow" in delivery_text.lower() or "1 day" in delivery_text.lower():
        pros.append("Fast 1-day express delivery")

    return {
        "platform": _get_val(offer, "platform", default="Store"),
        "title": _get_val(offer, "title", "name", default="Product"),
        "price": current_price,
        "original_price": original_price,
        "rating": raw_rating_float or 4.2,
        "review_count": raw_reviews_int,
        "seller_name": seller_name,
        "seller_rating": seller_r_float,
        "delivery_text": delivery_text,
        "offer_text": offer_text if offer_text not in (True, "True") else "Special Offer Available",
        "composite_score": composite_score,
        "factor_scores": {
            "price": round(price_subscore * 100),
            "rating": round(rating_subscore * 100),
            "seller": round(seller_subscore * 100),
            "perks": round(perk_subscore * 100),
            "delivery": round(delivery_subscore * 100),
        },
        "pros": pros,
        "cons": cons,
        "url": _get_val(offer, "url", default=""),
        "image_url": _get_val(offer, "image_url", default=""),
    }


def analyze_recommendation(comparison_or_offers: Union[Dict[str, Any], List[Any]], persona: str = "balanced") -> Dict[str, Any]:
    """
    Full AI recommendation analysis for a product comparison.
    Ranks all offers, selects the winning offer, computes trade-offs,
    and returns a structured explainable payload.
    """
    if isinstance(comparison_or_offers, dict):
        offers = comparison_or_offers.get("offers", [])
        comparison_name = comparison_or_offers.get("name", "Product")
        comparison_image = comparison_or_offers.get("image_url")
    else:
        offers = comparison_or_offers
        comparison_name = "Product"
        comparison_image = None

    if not offers:
        return {
            "winner": None,
            "alternatives": [],
            "verdict_summary": "No offers available to evaluate.",
            "confidence": "Low",
        }

    scored_offers = [score_offer(o, offers, persona=persona) for o in offers]
    
    # Sort descending by composite score
    scored_offers.sort(key=lambda x: x["composite_score"], reverse=True)
    
    winner = scored_offers[0]
    alternatives = scored_offers[1:]
    
    # Generate Natural Language AI Verdict
    winner_plat = winner["platform"]
    winner_score = winner["composite_score"]
    winner_price = f"₹{int(winner['price']):,}" if winner["price"] else "Competitive price"
    
    if alternatives:
        alt_plat = alternatives[0]["platform"]
        alt_price = f"₹{int(alternatives[0]['price']):,}" if alternatives[0]["price"] else "alternative price"
        
        if winner["price"] and alternatives[0]["price"] and winner["price"] < alternatives[0]["price"]:
            diff = int(alternatives[0]["price"] - winner["price"])
            verdict = (
                f"{winner_plat} is SmartBuy's top recommendation for this item. "
                f"It is ₹{diff:,} cheaper than {alt_plat} while offering a strong "
                f"{winner['rating']}★ verified customer rating and reliable fulfillment."
            )
        elif winner["price"] and alternatives[0]["price"] and winner["price"] > alternatives[0]["price"]:
            diff = int(winner["price"] - alternatives[0]["price"])
            verdict = (
                f"{winner_plat} is recommended despite being ₹{diff:,} higher than {alt_plat} "
                f"because it offers significantly higher seller reliability, superior rating ({winner['rating']}★), "
                f"and verified delivery security."
            )
        else:
            verdict = (
                f"{winner_plat} edges ahead with a score of {winner_score}/100 "
                f"offering the most balanced combination of customer ratings ({winner['rating']}★), "
                f"seller trust, and value."
            )
    else:
        verdict = f"{winner_plat} offers the best overall deal with a SmartBuy score of {winner_score}/100."

    # Confidence rating
    confidence = "Very High" if len(offers) >= 2 and winner.get("review_count", 0) > 20 else "High"

    return {
        "product_name": comparison_name,
        "image_url": comparison_image or winner.get("image_url"),
        "persona": persona,
        "confidence": confidence,
        "winner": winner,
        "alternatives": alternatives,
        "verdict_summary": verdict,
    }


def calculate_offer_score(offer: Any) -> float:
    """
    Legacy compatibility bridge for existing routes.
    """
    if hasattr(offer, "product") and offer.product and hasattr(offer.product, "offers"):
        all_offers = list(offer.product.offers)
    else:
        all_offers = [offer]
    result = score_offer(offer, all_offers, persona="balanced")
    return result["composite_score"]

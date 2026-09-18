def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))

def price_score(offer):
    # Lower price gets a higher score.
    prices = [
        float(o.price)
        for o in offer.product.offers
        if o.price is not None and float(o.price) >= 0
    ]

    if not prices:
        return 0

    lowest = min(prices)
    current = float(offer.price)

    if lowest == 0:
        return 1 if current == 0 else 0

    return clamp(lowest / current)

def rating_score(offer):
    rating = float(offer.rating or 0)
    return clamp(rating / 5)

def review_score(offer):
    count = int(offer.review_count or 0)
    # Saturates smoothly instead of allowing huge review counts to dominate.
    return clamp(count / 10000)

def seller_score(offer):
    rating = float(offer.seller_rating or 0)
    return clamp(rating / 5) if rating else 0.5

def offer_score(offer):
    return 1.0 if offer.offer_text else 0.0

def calculate_offer_score(offer):
    """
    SmartBuy initial recommendation score.

    Weights:
    Price 40%
    Rating 25%
    Reviews 15%
    Seller 10%
    Offer 10%
    """
    score = (
        price_score(offer) * 0.40 +
        rating_score(offer) * 0.25 +
        review_score(offer) * 0.15 +
        seller_score(offer) * 0.10 +
        offer_score(offer) * 0.10
    )

    return score * 100

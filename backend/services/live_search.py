from services.scraper import search_platform
from services.product_matcher import match_all


def _safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _value(item, *keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def _build_comparisons(matches):
    comparisons = []

    for match in matches:
        source = match.get("source", {})
        target = match.get("target", {})

        comparisons.append({
            "name": (
                _value(source, "title", "name")
                or _value(target, "title", "name")
                or "Matched Product"
            ),
            "match": {
                "score": match.get("score", 0),
                "explanation": match.get("explanation"),
            },
            "offers": [
                {
                    "platform": "Amazon",
                    "title": _value(source, "title", "name"),
                    "price": _value(source, "price", "sale_price"),
                    "original_price": _value(
                        source, "original_price", "mrp"
                    ),
                    "rating": _value(source, "rating", "star_rating"),
                    "review_count": _value(
                        source, "review_count", "reviews"
                    ),
                    "url": _value(source, "url", "product_url"),
                    "image_url": _value(
                        source, "image_url", "image"
                    ),
                    "availability": _value(
                        source, "availability", "stock"
                    ),
                    "brand": _value(source, "brand"),
                    "model_number": _value(
                        source,
                        "model_number",
                        "model",
                        "mpn",
                    ),
                    "asin": _value(source, "asin"),
                },
                {
                    "platform": "Flipkart",
                    "title": _value(target, "title", "name"),
                    "price": _value(target, "price", "sale_price"),
                    "original_price": _value(
                        target, "original_price", "mrp"
                    ),
                    "rating": _value(target, "rating", "star_rating"),
                    "review_count": _value(
                        target, "review_count", "reviews"
                    ),
                    "url": _value(target, "url", "product_url"),
                    "image_url": _value(
                        target, "image_url", "image"
                    ),
                    "availability": _value(
                        target, "availability", "stock"
                    ),
                    "brand": _value(target, "brand"),
                    "model_number": _value(
                        target,
                        "model_number",
                        "model",
                        "mpn",
                    ),
                    "item_id": _value(
                        target, "item_id", "sku"
                    ),
                },
            ],
        })

    return comparisons


def live_search(query, pages=1, min_score=62):
    query = (query or "").strip()

    if not query:
        raise ValueError("Search query is required")

    pages = max(1, min(_safe_int(pages, 1), 3))
    min_score = max(0, min(_safe_int(min_score, 62), 100))

    print("\n" + "=" * 72)
    print("SMARTBUY CROSS-PLATFORM SEARCH")
    print("=" * 72)
    print(f"Query: {query}")
    print(f"Pages: {pages}")
    print(f"Minimum match score: {min_score}")
    print("=" * 72)

    # ------------------------------------------------------------
    # 1. AMAZON
    # IMPORTANT: scraper signature is search_platform(query, platform, pages)
    # ------------------------------------------------------------
    print("\n[1/3] SEARCHING AMAZON...")

    amazon = search_platform(
        query,
        "Amazon",
        pages=pages,
    ) or []

    print(
        f"[SmartBuy] Amazon products received: {len(amazon)}"
    )

    # ------------------------------------------------------------
    # 2. FLIPKART
    # IMPORTANT: scraper signature is search_platform(query, platform, pages)
    # ------------------------------------------------------------
    print("\n[2/3] SEARCHING FLIPKART...")

    flipkart = search_platform(
        query,
        "Flipkart",
        pages=pages,
    ) or []

    print(
        f"[SmartBuy] Flipkart products received: {len(flipkart)}"
    )

    if not amazon and not flipkart:
        return {
            "success": False,
            "stage": "scraper",
            "error": (
                "No products were returned from "
                "Amazon or Flipkart."
            ),
            "query": query,
            "summary": {
                "amazon_products": 0,
                "flipkart_products": 0,
                "matched_products": 0,
            },
            "comparisons": [],
        }

    # ------------------------------------------------------------
    # 3. NLP PRODUCT MATCHER
    # ------------------------------------------------------------
    print("\n[3/3] RUNNING NLP PRODUCT MATCHER...")
    print("=" * 72)
    print(
        f"[SmartBuy] Matcher input: "
        f"Amazon={len(amazon)}, Flipkart={len(flipkart)}"
    )
    print(
        f"[SmartBuy] Matcher minimum score: {min_score}"
    )

    try:
        result = match_all(
            amazon,
            flipkart,
            min_score=min_score,
        )
    except TypeError:
        print(
            "[SmartBuy] Matcher does not accept min_score; "
            "using its internal threshold."
        )
        result = match_all(amazon, flipkart)
    except Exception as exc:
        print(
            f"[SmartBuy] MATCHER ERROR: "
            f"{type(exc).__name__}: {exc}"
        )
        raise RuntimeError(
            f"NLP product matcher failed: {exc}"
        ) from exc

    if not isinstance(result, dict):
        result = {"matches": []}

    matches = result.get("matches", []) or []

    print("[SmartBuy] Matcher completed successfully")
    print(
        f"[SmartBuy] Matches found: {len(matches)}"
    )
    print(
        "[SmartBuy] Unmatched Amazon: "
        f"{result.get('unmatched_first_platform', 0)}"
    )
    print(
        "[SmartBuy] Unmatched Flipkart: "
        f"{result.get('unmatched_second_platform', 0)}"
    )
    print("=" * 72)

    comparisons = _build_comparisons(matches)

    response = {
        "success": True,
        "stage": "complete",
        "query": query,
        "summary": {
            "amazon_products": len(amazon),
            "flipkart_products": len(flipkart),
            "matched_products": len(comparisons),
            "unmatched_amazon": result.get(
                "unmatched_first_platform", 0
            ),
            "unmatched_flipkart": result.get(
                "unmatched_second_platform", 0
            ),
        },
        "comparisons": comparisons,
    }

    print(
        "[SmartBuy] API response prepared: "
        f"{len(comparisons)} comparisons"
    )

    return response

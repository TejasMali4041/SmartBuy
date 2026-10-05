import time
import threading
from concurrent.futures import ThreadPoolExecutor

from services.scraper import search_platform
from services.product_matcher import match_all

# Thread-safe in-memory cache for live search results (query, pages, min_score) -> (timestamp, result)
_SEARCH_CACHE = {}
_SEARCH_CACHE_LOCK = threading.Lock()
_SEARCH_IN_FLIGHT = {}
_SEARCH_IN_FLIGHT_LOCK = threading.Lock()
_SEARCH_CACHE_TTL = 900  # 15 minutes


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
                "confidence": match.get("confidence"),
                "variant_conflicts": match.get("variant_conflicts", []),
                "variant_matched": match.get("variant_matched", []),
            },
            "offers": [
                {
                    "platform": "Amazon",
                    "title": _value(source, "title", "name"),
                    "price": _value(source, "price", "sale_price"),
                    "original_price": _value(
                        source, "original_price", "mrp", "initial_price"
                    ),
                    "discount": _value(
                        source, "discount", "discount_percentage", "discount_percent"
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
                    "color": _value(source, "color", "colour"),
                    "size": _value(source, "size", "storage"),
                    "model_number": _value(
                        source,
                        "model_number",
                        "model",
                        "mpn",
                    ),
                    "asin": _value(source, "asin"),
                    "description": _value(
                        source, "description", "features", "about_product", "about_this_item"
                    ),
                    "seller_name": _value(source, "seller_name", "seller"),
                    "seller_rating": _value(source, "seller_rating"),
                    "delivery_text": _value(source, "delivery_text", "delivery", "shipping"),
                    "offer_text": _value(source, "offer_text", "offers", "deal"),
                    "category": _value(source, "category", "department"),
                    "return_window": _value(source, "return_window", "return_policy"),
                },
                {
                    "platform": "Flipkart",
                    "title": _value(target, "title", "name"),
                    "price": _value(target, "price", "sale_price"),
                    "original_price": _value(
                        target, "original_price", "mrp", "initial_price"
                    ),
                    "discount": _value(
                        target, "discount", "discount_percentage", "discount_percent"
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
                    "color": _value(target, "color", "colour"),
                    "size": _value(target, "size", "storage"),
                    "model_number": _value(
                        target,
                        "model_number",
                        "model",
                        "mpn",
                    ),
                    "item_id": _value(
                        target, "item_id", "sku"
                    ),
                    "description": _value(
                        target, "description", "features", "about_product", "about_this_item"
                    ),
                    "seller_name": _value(target, "seller_name", "seller"),
                    "seller_rating": _value(target, "seller_rating"),
                    "delivery_text": _value(target, "delivery_text", "delivery", "shipping"),
                    "offer_text": _value(target, "offer_text", "offers", "deal"),
                    "category": _value(target, "category", "department"),
                    "return_window": _value(target, "return_window", "return_policy"),
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

    cache_key = (query.lower(), pages, min_score)
    now = time.time()

    # 1. In-memory cache check (avoids redundant Bright Data scraper calls)
    with _SEARCH_CACHE_LOCK:
        if cache_key in _SEARCH_CACHE:
            saved_time, cached_data = _SEARCH_CACHE[cache_key]
            if now - saved_time < _SEARCH_CACHE_TTL:
                print(
                    f"\n[SmartBuy] Cache HIT for '{query}' (pages={pages}, min_score={min_score}) - returning cached response"
                )
                return cached_data

    # 2. In-flight deduplication (prevents duplicate scraping if two calls arrive simultaneously)
    with _SEARCH_IN_FLIGHT_LOCK:
        if cache_key in _SEARCH_IN_FLIGHT:
            event, container = _SEARCH_IN_FLIGHT[cache_key]
            is_initiator = False
        else:
            event = threading.Event()
            container = {}
            _SEARCH_IN_FLIGHT[cache_key] = (event, container)
            is_initiator = True

    if not is_initiator:
        print(
            f"\n[SmartBuy] In-flight deduplication: waiting for existing search on '{query}'..."
        )
        event.wait(timeout=180)
        if "error" in container:
            raise container["error"]
        return container.get("result", {})

    try:
        response = _perform_live_search(query, pages=pages, min_score=min_score)

        if response.get("success") is True:
            with _SEARCH_CACHE_LOCK:
                _SEARCH_CACHE[cache_key] = (time.time(), response)

        container["result"] = response
        return response

    except Exception as exc:
        container["error"] = exc
        raise

    finally:
        event.set()
        with _SEARCH_IN_FLIGHT_LOCK:
            _SEARCH_IN_FLIGHT.pop(cache_key, None)


def _perform_live_search(query, pages=1, min_score=62):
    print("\n" + "=" * 72)
    print("SMARTBUY CROSS-PLATFORM SEARCH")
    print("=" * 72)
    print(f"Query: {query}")
    print(f"Pages: {pages}")
    print(f"Minimum match score: {min_score}")
    print("=" * 72)

    # ------------------------------------------------------------
    # 1 & 2. SEARCH AMAZON AND FLIPKART IN PARALLEL
    # IMPORTANT: scraper signature is search_platform(query, platform, pages)
    # ------------------------------------------------------------
    print("\n[1/3] SEARCHING AMAZON...")
    print("[2/3] SEARCHING FLIPKART...")
    print("[SmartBuy] Running both searches in parallel...")

    with ThreadPoolExecutor(max_workers=2) as executor:
        amazon_future = executor.submit(
            search_platform, query, "Amazon", pages
        )
        flipkart_future = executor.submit(
            search_platform, query, "Flipkart", pages
        )

        amazon = amazon_future.result() or []
        flipkart = flipkart_future.result() or []

    print(
        f"[SmartBuy] Amazon products received: {len(amazon)}"
    )
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

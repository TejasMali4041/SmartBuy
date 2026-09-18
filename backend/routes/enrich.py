"""On-demand product detail enrichment.

Called by the Compare page when the user opens a specific comparison.
Accepts the basic offer data (with URLs) and enriches each offer by
scraping the product detail page using Bright Data's product datasets.

Includes in-memory URL caching and in-flight deduplication to prevent
duplicate API calls and conserve Bright Data tokens.
"""

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Blueprint, request, jsonify

from services.scraper import scrape_product_url

enrich_bp = Blueprint(
    "enrich",
    __name__,
    url_prefix="/api/search",
)

# In-memory cache for scraped product details (url -> dict)
# Avoids re-scraping the same product URL multiple times and saves tokens.
_ENRICH_CACHE = {}
_CACHE_LOCK = threading.Lock()

# In-flight deduplication: if two identical URLs are requested at the same time
# (e.g., React StrictMode double-mount or rapid clicks), the second request
# waits for the first one to finish rather than burning duplicate API tokens.
_IN_FLIGHT = {}
_IN_FLIGHT_LOCK = threading.Lock()


def _fetch_product_details(url, platform):
    """Fetch product details with cache check and in-flight deduplication."""
    # 1. Cache hit check
    with _CACHE_LOCK:
        if url in _ENRICH_CACHE:
            print(
                f"[SmartBuy Enrich] Cache hit for {platform}: "
                f"{url[:70]}... (0 tokens used)"
            )
            return _ENRICH_CACHE[url]

    # 2. In-flight check: is another thread/request already scraping this URL?
    with _IN_FLIGHT_LOCK:
        if url in _IN_FLIGHT:
            event, container = _IN_FLIGHT[url]
            is_initiator = False
        else:
            event = threading.Event()
            container = {}
            _IN_FLIGHT[url] = (event, container)
            is_initiator = True

    if not is_initiator:
        print(
            f"[SmartBuy Enrich] Deduplicating in-flight call for {platform}: "
            f"{url[:70]}... (waiting on existing scrape)"
        )
        # Wait for the first scraper to complete (up to 90s)
        event.wait(timeout=90)
        return container.get("result", {})

    # 3. We are the initiator: trigger the actual Bright Data scrape
    try:
        print(
            f"[SmartBuy Enrich] Scraping {platform}: "
            f"{url[:80]}..."
        )
        detailed = scrape_product_url(url)

        with _CACHE_LOCK:
            _ENRICH_CACHE[url] = detailed

        container["result"] = detailed
        return detailed

    except Exception as exc:
        container["error"] = exc
        raise

    finally:
        event.set()
        with _IN_FLIGHT_LOCK:
            _IN_FLIGHT.pop(url, None)


def _enrich_single_offer(offer):
    """Scrape a single product URL and merge with existing offer data."""

    url = (offer.get("url") or "").strip()
    platform = (offer.get("platform") or "").strip()

    if not url or not url.startswith(("http://", "https://")):
        print(
            f"[SmartBuy Enrich] Skipping {platform}: "
            f"no valid URL"
        )
        return offer

    try:
        detailed = _fetch_product_details(url, platform)

        # Merge: detailed data wins, but keep original fields
        # as fallback for anything the product scraper missed.
        merged = {**offer}

        for key, value in detailed.items():
            if value is None:
                continue
            if value == "Not available":
                continue
            if isinstance(value, str) and not value.strip():
                continue
            merged[key] = value

        # Ensure platform stays correct
        merged["platform"] = platform or merged.get("platform")

        print(
            f"[SmartBuy Enrich] {platform} enriched successfully"
        )

        return merged

    except Exception as exc:
        print(
            f"[SmartBuy Enrich] {platform} scrape failed: "
            f"{type(exc).__name__}: {exc}"
        )
        # Return original offer data on failure
        return offer


@enrich_bp.route("/enrich", methods=["POST"])
def enrich_offers():
    """Enrich comparison offers with full product detail data.

    Expects JSON body:
    {
        "offers": [
            {"platform": "Amazon", "url": "...", ...},
            {"platform": "Flipkart", "url": "...", ...}
        ]
    }
    """

    body = request.get_json(silent=True) or {}
    offers = body.get("offers", [])

    if not isinstance(offers, list) or not offers:
        return jsonify({
            "success": False,
            "error": "A non-empty 'offers' array is required",
        }), 400

    print(
        f"\n[SmartBuy Enrich] Enriching {len(offers)} "
        f"offer(s) in parallel..."
    )

    enriched_offers = [None] * len(offers)

    # Scrape all offers in parallel to minimize wait time
    with ThreadPoolExecutor(max_workers=len(offers)) as executor:

        future_to_index = {
            executor.submit(
                _enrich_single_offer, offer
            ): i
            for i, offer in enumerate(offers)
        }

        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                enriched_offers[index] = future.result()
            except Exception as exc:
                print(
                    f"[SmartBuy Enrich] Offer {index} "
                    f"thread failed: {exc}"
                )
                enriched_offers[index] = offers[index]

    print(
        "[SmartBuy Enrich] All offers enriched. "
        "Returning response.\n"
    )

    return jsonify({
        "success": True,
        "offers": enriched_offers,
    }), 200

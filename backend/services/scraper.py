import os
import json
import re
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse, quote_plus

import requests
from dotenv import load_dotenv

from extensions import db
from models.offer import Offer
from models.product import Product
from models.price_history import PriceHistory
from services.normalizer import normalize_product_name


load_dotenv()


# =========================================================
# BRIGHT DATA CONFIGURATION
# =========================================================

BRIGHTDATA_API_KEY = os.getenv("BRIGHTDATA_API_KEY")

# Product page datasets
AMAZON_PRODUCT_DATASET_ID = os.getenv(
    "BRIGHTDATA_AMAZON_DATASET_ID",
    "gd_l7q7dkf244hwjntr0"
)

FLIPKART_PRODUCT_DATASET_ID = os.getenv(
    "BRIGHTDATA_FLIPKART_DATASET_ID",
    "gd_mljhtaoe2n284ux79e"
)

# Search datasets
AMAZON_SEARCH_DATASET_ID = os.getenv(
    "BRIGHTDATA_AMAZON_SEARCH_DATASET_ID",
    "gd_lwdb4vjm1ehb499uxs"
)

FLIPKART_SEARCH_DATASET_ID = os.getenv(
    "BRIGHTDATA_FLIPKART_SEARCH_DATASET_ID",
    "gd_mj85tmhylhmbazp6h"
)


BRIGHTDATA_TRIGGER_URL = (
    "https://api.brightdata.com/datasets/v3/trigger"
)

BRIGHTDATA_SNAPSHOT_URL = (
    "https://api.brightdata.com/datasets/v3/snapshot"
)


# =========================================================
# GENERAL HELPERS
# =========================================================

def _first(value):
    if isinstance(value, list):
        for item in value:
            if item not in (None, "", [], {}):
                return item
        return None

    return value


def _clean_text(value, default="Not available"):

    if value is None:
        return default

    if isinstance(value, list):

        values = []

        for item in value:

            if isinstance(item, dict):
                item = (
                    item.get("name")
                    or item.get("value")
                    or item.get("text")
                    or item.get("title")
                    or item.get("label")
                )

            if item not in (None, ""):
                values.append(str(item).strip())

        if not values:
            return default

        return ", ".join(values)

    if isinstance(value, dict):

        value = (
            value.get("name")
            or value.get("value")
            or value.get("text")
            or value.get("title")
            or value.get("label")
            or value.get("description")
        )

        if value is None:
            return default

    value = str(value).strip()

    return value if value else default


def _number(value):

    if value is None:
        return None

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, list):

        for item in value:

            number = _number(item)

            if number is not None:
                return number

        return None

    if isinstance(value, dict):

        for key in [
            "value",
            "amount",
            "price",
            "rating",
            "count",
            "number",
        ]:

            if key in value:

                number = _number(value[key])

                if number is not None:
                    return number

        return None

    text = str(value)

    text = text.replace(",", "")
    text = text.replace("₹", "")
    text = text.replace("$", "")
    text = text.replace("€", "")
    text = text.replace("£", "")

    match = re.search(
        r"-?\d+(?:\.\d+)?",
        text
    )

    if not match:
        return None

    try:
        return float(match.group(0))
    except (ValueError, TypeError):
        return None


def _integer(value, default=0):

    number = _number(value)

    if number is None:
        return default

    return int(number)


def _normalise_url(url):

    if not url:
        return ""

    return str(url).strip()


# =========================================================
# FLEXIBLE FIELD MATCHING
# =========================================================

def _get_field(data, aliases, default=None):

    if not isinstance(data, (dict, list)):
        return default

    aliases_normalized = {
        str(alias)
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
        for alias in aliases
    }

    def recursive_search(obj):

        if isinstance(obj, dict):

            # Exact key match
            for key, value in obj.items():

                normalized_key = (
                    str(key)
                    .lower()
                    .replace("-", "_")
                    .replace(" ", "_")
                )

                if normalized_key in aliases_normalized:

                    if value not in (
                        None,
                        "",
                        [],
                        {}
                    ):
                        return value

            # Nested search
            for value in obj.values():

                result = recursive_search(value)

                if result not in (
                    None,
                    "",
                    [],
                    {}
                ):
                    return result

        elif isinstance(obj, list):

            for item in obj:

                result = recursive_search(item)

                if result not in (
                    None,
                    "",
                    [],
                    {}
                ):
                    return result

        return None

    result = recursive_search(data)

    return result if result is not None else default


def _get_text(data, aliases, default="Not available"):

    return _clean_text(
        _get_field(data, aliases),
        default
    )


def _get_number(data, aliases):

    return _number(
        _get_field(data, aliases)
    )


# =========================================================
# PLATFORM DETECTION
# =========================================================

def _platform_from_url(url):

    host = urlparse(url).netloc.lower()

    if "amazon." in host:
        return "Amazon"

    if "flipkart." in host:
        return "Flipkart"

    if "meesho." in host:
        return "Meesho"

    if "myntra." in host:
        return "Myntra"

    return host.replace("www.", "") or "Unknown"


def detect_platform(url):

    platform = _platform_from_url(url)

    if platform not in [
        "Amazon",
        "Flipkart"
    ]:

        raise ValueError(
            "Currently only Amazon and Flipkart are supported"
        )

    return platform


# =========================================================
# DATASET SELECTION
# =========================================================

def _get_product_dataset_id(platform):

    if platform == "Amazon":
        return AMAZON_PRODUCT_DATASET_ID

    if platform == "Flipkart":
        return FLIPKART_PRODUCT_DATASET_ID

    raise ValueError(
        f"Unsupported platform: {platform}"
    )


def _get_search_dataset_id(platform):

    if platform == "Amazon":
        return AMAZON_SEARCH_DATASET_ID

    if platform == "Flipkart":
        return FLIPKART_SEARCH_DATASET_ID

    raise ValueError(
        f"Unsupported platform: {platform}"
    )


# =========================================================
# BRIGHT DATA TRIGGER
# =========================================================

def _trigger_dataset(dataset_id, payload):
    """Trigger a Bright Data dataset job.

    Bright Data's current examples use JSON output and an uncompressed
    webhook delivery for structured scraper jobs. include_errors is also
    enabled so individual scraper errors are visible instead of being
    mistaken for an empty result set.
    """
    if not BRIGHTDATA_API_KEY:
        raise ValueError(
            "BRIGHTDATA_API_KEY is missing from .env"
        )

    headers = {
        "Authorization": f"Bearer {BRIGHTDATA_API_KEY}",
        "Content-Type": "application/json",
    }

    response = requests.post(
        BRIGHTDATA_TRIGGER_URL,
        params={
            "dataset_id": dataset_id,
            "include_errors": "true",
            "format": "json",
            "uncompressed_webhook": "true",
        },
        headers=headers,
        json=payload,
        timeout=30,
    )

    print(
        "[SmartBuy] Bright Data HTTP status:",
        response.status_code
    )

    if not response.ok:
        try:
            error_data = response.json()
        except Exception:
            error_data = response.text

        raise ValueError(
            f"Bright Data trigger failed "
            f"(HTTP {response.status_code}): "
            f"{error_data}"
        )

    data = response.json()

    print(
        "[SmartBuy] Trigger response:",
        data
    )

    snapshot_id = data.get("snapshot_id")

    if not snapshot_id:
        raise ValueError(
            f"Bright Data did not return snapshot_id: {data}"
        )

    return snapshot_id


# =========================================================
# SNAPSHOT
# =========================================================

def _get_snapshot(snapshot_id, timeout=300):
    """Wait for Bright Data async collection to become ready, then download it.

    Bright Data's async flow is:
        trigger -> snapshot_id -> GET /progress/{snapshot_id}
        -> wait for status=ready -> GET /snapshot/{snapshot_id}?format=json

    The progress endpoint is the source of truth for job state.  The snapshot
    endpoint is used only to download the finished dataset.  A metadata-only
    response is never passed to a product normalizer.
    """
    if not BRIGHTDATA_API_KEY:
        raise ValueError("BRIGHTDATA_API_KEY is missing from .env")

    headers = {
        "Authorization": f"Bearer {BRIGHTDATA_API_KEY}"
    }

    progress_url = (
        "https://api.brightdata.com/datasets/v3/progress/"
        f"{snapshot_id}"
    )
    snapshot_url = (
        "https://api.brightdata.com/datasets/v3/snapshot/"
        f"{snapshot_id}"
    )

    start_time = time.time()
    print(f"[SmartBuy] Waiting for snapshot: {snapshot_id}")

    def _is_product_record(item):
        if not isinstance(item, dict):
            return False
        if item.get("error"):
            return False

        # Bright Data search datasets use slightly different field names.
        # These are enough to distinguish real records from metadata such as
        # timestamp/input/snapshot_id.
        product_keys = {
            "title", "name", "product_name", "product_title", "item_name",
            "url", "product_url", "product_page_url", "link",
            "sku", "item_id", "variant_id", "product_id",
            "price", "sale_price", "current_price", "final_price",
            "brand", "rank"
        }
        return any(
            key in item and item.get(key) not in (None, "", [], {})
            for key in product_keys
        )

    def _extract_records(data):
        if isinstance(data, list):
            return [item for item in data if _is_product_record(item)]

        if isinstance(data, dict):
            if data.get("error"):
                raise ValueError(
                    "Bright Data scraper failed "
                    f"(error_code={data.get('error_code', 'unknown')}): "
                    f"{data.get('error')}"
                )

            results = data.get("results")
            if isinstance(results, list):
                return [item for item in results if _is_product_record(item)]

            if _is_product_record(data):
                return [data]

        return []

    # ---------------------------------------------------------
    # 1. Poll the dedicated Bright Data progress endpoint.
    # ---------------------------------------------------------
    ready = False

    while time.time() - start_time < timeout:
        try:
            response = requests.get(
                progress_url,
                headers=headers,
                timeout=30,
            )

            if response.status_code == 200:
                progress = response.json()
                status = ""

                if isinstance(progress, dict):
                    status = str(progress.get("status", "")).lower().strip()

                print(
                    "[SmartBuy] Snapshot status:",
                    status or "unknown"
                )

                if status in {"failed", "error", "cancelled", "canceled"}:
                    raise ValueError(
                        "Bright Data snapshot failed: "
                        f"{progress}"
                    )

                if status in {
                    "ready", "completed", "complete", "done",
                    "success", "finished"
                }:
                    ready = True
                    break

                time.sleep(5)
                continue

            if response.status_code in {202, 204, 404}:
                print("[SmartBuy] Snapshot still processing...")
                time.sleep(5)
                continue

            response.raise_for_status()

        except requests.RequestException as exc:
            print(
                "[SmartBuy] Progress check failed; retrying:",
                exc
            )
            time.sleep(5)

    if not ready:
        raise TimeoutError(
            "Bright Data snapshot did not become ready "
            f"within {timeout} seconds"
        )

    # ---------------------------------------------------------
    # 2. Download the completed snapshot.
    # ---------------------------------------------------------
    for attempt in range(3):
        response = requests.get(
            snapshot_url,
            params={"format": "json"},
            headers=headers,
            timeout=60,
        )

        if response.status_code in {202, 204, 404}:
            print(
                "[SmartBuy] Snapshot download not ready yet; "
                "checking progress again..."
            )
            time.sleep(5)
            continue

        response.raise_for_status()
        data = response.json()

        # Occasionally an async response can still expose a status object.
        if isinstance(data, dict):
            status = str(data.get("status", "")).lower().strip()
            if status in {
                "starting", "running", "pending", "processing"
            }:
                print(
                    "[SmartBuy] Snapshot download still reports "
                    f"status={status}; checking progress again..."
                )
                ready = False
                while time.time() - start_time < timeout:
                    progress_response = requests.get(
                        progress_url,
                        headers=headers,
                        timeout=30,
                    )
                    if progress_response.status_code == 200:
                        progress = progress_response.json()
                        progress_status = str(
                            progress.get("status", "")
                        ).lower().strip()
                        print(
                            "[SmartBuy] Snapshot status:",
                            progress_status or "unknown"
                        )
                        if progress_status in {
                            "ready", "completed", "complete", "done",
                            "success", "finished"
                        }:
                            ready = True
                            break
                        if progress_status in {
                            "failed", "error", "cancelled", "canceled"
                        }:
                            raise ValueError(
                                "Bright Data snapshot failed: "
                                f"{progress}"
                            )
                    time.sleep(5)

                if not ready:
                    break
                continue

        records = _extract_records(data)

        if records:
            return records

        # Diagnostic: Bright Data reports the snapshot as READY, but the
        # returned JSON does not match the product-record shapes we currently
        # support. Print the raw response so we can see the exact Flipkart
        # structure without changing the scraping or matching logic.
        print("\n[SmartBuy] ===== RAW SNAPSHOT RESPONSE =====")
        print("[SmartBuy] Snapshot HTTP status:", response.status_code)
        try:
            print(json.dumps(data, indent=2, ensure_ascii=False)[:20000])
        except Exception:
            print(repr(data)[:20000])
        print("[SmartBuy] ===== END RAW SNAPSHOT RESPONSE =====\n")

        print(
            "[SmartBuy] Snapshot completed but contained no usable "
            "product records."
        )
        break

    raise ValueError(
        "Bright Data snapshot completed but no usable product records "
        f"were returned for snapshot {snapshot_id}"
    )


# =========================================================
# PRODUCT URL SCRAPER
# =========================================================

def _trigger_product_url(url, platform):

    dataset_id = _get_product_dataset_id(platform)

    # Flipkart product scraper
    # does NOT accept page.
    if platform == "Flipkart":

        payload = [
            {
                "url": url,
                "all_variations": False
            }
        ]

    else:

        # Amazon product scraper
        payload = [
            {
                "url": url
            }
        ]

    return _trigger_dataset(
        dataset_id,
        payload
    )


# =========================================================
# AMAZON NORMALIZER
# =========================================================

def _normalize_amazon(data, original_url):

    title = _get_text(
        data,
        [
            "title",
            "name",
            "product_name",
            "product_title",
            "item_name",
            "product_title_text",
            "name_of_product",
        ],
    )

    if title == "Not available":

        raise ValueError(
            "Amazon product title could not be extracted. "
            f"Available fields: {list(data.keys())}"
        )

    price = _get_number(
        data,
        [
            "final_price",
            "sale_price",
            "selling_price",
            "current_price",
            "buybox_price",
            "buy_box_price",
            "deal_price",
            "discounted_price",
            "offer_price",
            "price",
            "price_value",
            "amount",
            "current_price_value",
            "purchase_price",
        ],
    )

    # Price may legitimately be unavailable
    # when the product is out of stock.
    original_price = _get_number(
        data,
        [
            "initial_price",
            "original_price",
            "list_price",
            "mrp",
            "maximum_retail_price",
            "was_price",
            "regular_price",
            "strikethrough_price",
            "old_price",
            "original_price_value",
        ],
    )

    rating = _get_number(
        data,
        [
            "rating",
            "stars",
            "star_rating",
            "rating_value",
            "product_rating",
            "average_rating",
            "customer_rating",
            "ratings",
        ],
    )

    review_count = _integer(
        _get_field(
            data,
            [
                "reviews_count",
                "review_count",
                "ratings_total",
                "rating_count",
                "total_reviews",
                "total_ratings",
                "reviews",
                "number_of_reviews",
                "customer_reviews_count",
            ]
        ),
        0
    )

    brand = _get_text(
        data,
        [
            "brand",
            "brand_name",
            "manufacturer",
            "product_brand",
        ],
    )

    model_number = _get_text(
        data,
        [
            "model_number",
            "model",
            "model_name",
            "model_id",
            "sku",
            "product_id",
            "asin",
            "item_id",
        ],
    )

    image_url = _get_text(
        data,
        [
            "image",
            "image_url",
            "main_image",
            "main_image_url",
            "product_image",
            "product_image_url",
            "thumbnail",
            "thumbnail_url",
            "primary_image",
        ],
    )

    seller_name = _get_text(
        data,
        [
            "seller_name",
            "seller",
            "seller_name_text",
            "buybox_seller",
            "buy_box_seller",
            "sold_by",
            "soldby",
            "merchant",
            "merchant_name",
            "store_name",
        ],
    )

    seller_rating = _get_number(
        data,
        [
            "seller_rating",
            "seller_star_rating",
            "seller_rating_value",
            "seller_feedback_rating",
            "merchant_rating",
            "merchant_rating_value",
        ],
    )

    availability = _get_text(
        data,
        [
            "availability",
            "availability_status",
            "stock",
            "stock_status",
            "inventory_status",
            "in_stock",
            "is_in_stock",
            "buybox_availability",
        ],
    )

    delivery_text = _get_text(
        data,
        [
            "delivery",
            "delivery_text",
            "delivery_info",
            "delivery_information",
            "delivery_details",
            "shipping",
            "shipping_text",
            "shipping_info",
            "shipping_information",
            "shipping_details",
            "estimated_delivery",
            "delivery_date",
            "arrival",
            "arrives",
            "delivery_message",
            "fulfillment",
        ],
    )

    offer_text = _get_text(
        data,
        [
            "offer",
            "offer_text",
            "offers",
            "deal",
            "deal_text",
            "promotion",
            "promotions",
            "coupon",
            "coupon_text",
            "discount",
            "discount_text",
        ],
    )

    description = _get_text(
        data,
        [
            "description",
            "product_description",
            "about_product",
            "about_this_item",
            "bullet_points",
            "features",
            "product_details",
            "overview",
        ],
    )

    category = _get_text(
        data,
        [
            "category",
            "product_category",
            "category_name",
            "product_type",
            "department",
            "breadcrumb",
            "breadcrumbs",
        ],
    )

    # Variant information
    color = _get_text(
        data,
        [
            "color",
            "colour",
            "variant_color",
            "color_name",
        ],
        default=None
    )

    size = _get_text(
        data,
        [
            "size",
            "variant_size",
            "size_name",
            "storage",
            "storage_capacity",
            "ram",
        ],
        default=None
    )

    asin = _get_text(
        data,
        [
            "asin",
            "amazon_asin",
        ],
        default=None
    )

    return {
        "platform": "Amazon",
        "title": title,
        "url": _normalise_url(
            _get_text(
                data,
                [
                    "url",
                    "product_url",
                    "product_page_url",
                    "link",
                    "product_link",
                ],
                default=original_url,
            )
        ),
        "price": price,
        "original_price": original_price,
        "rating": rating,
        "review_count": review_count,
        "availability": availability,
        "image_url": image_url,
        "description": description,
        "brand": brand,
        "model_number": model_number,
        "seller_name": seller_name,
        "seller_rating": seller_rating,
        "delivery_text": delivery_text,
        "offer_text": offer_text,
        "category": category,
        "color": color,
        "size": size,
        "asin": asin,
        "scraped_at": datetime.utcnow().isoformat(),
        "snapshot_id": data.get("snapshot_id"),
    }


# =========================================================
# FLIPKART NORMALIZER
# =========================================================

def _normalize_flipkart(data, original_url):

    title = _get_text(
        data,
        [
            "title",
            "name",
            "product_name",
            "product_title",
            "item_name",
            "product_title_text",
        ],
    )

    if title == "Not available":

        raise ValueError(
            "Flipkart product title could not be extracted. "
            f"Available fields: {list(data.keys())}"
        )

    price = _get_number(
        data,
        [
            "sale_price",
            "selling_price",
            "sellingprice",
            "current_price",
            "final_price",
            "deal_price",
            "discounted_price",
            "offer_price",
            "price",
            "price_value",
            "amount",
            "special_price",
        ],
    )

    original_price = _get_number(
        data,
        [
            "original_price",
            "mrp",
            "maximum_retail_price",
            "list_price",
            "regular_price",
            "old_price",
            "was_price",
            "strikethrough_price",
        ],
    )

    if (
        original_price is not None
        and price is not None
        and original_price < price
    ):
        original_price = None

    rating = _get_number(
        data,
        [
            "star_rating",
            "rating",
            "stars",
            "rating_value",
            "product_rating",
            "average_rating",
            "customer_rating",
        ],
    )

    review_count = _integer(
        _get_field(
            data,
            [
                "review_count",
                "reviews_count",
                "rating_count",
                "ratings_total",
                "total_reviews",
                "total_ratings",
                "number_of_reviews",
                "customer_reviews_count",
            ]
        ),
        0
    )

    brand = _get_text(
        data,
        [
            "brand",
            "brand_name",
            "manufacturer",
            "product_brand",
        ],
    )

    model_number = _get_text(
        data,
        [
            "model_number",
            "model",
            "model_name",
            "model_id",
            "sku",
            "item_id",
            "product_id",
            "group_id",
            "part_number",
        ],
    )

    image_url = _get_text(
        data,
        [
            "image_url",
            "image",
            "main_image",
            "main_image_url",
            "product_image",
            "product_image_url",
            "primary_image",
            "thumbnail",
            "thumbnail_url",
        ],
    )

    availability = _get_text(
        data,
        [
            "availability",
            "availability_status",
            "stock",
            "stock_status",
            "inventory_status",
            "in_stock",
            "is_in_stock",
            "availability_text",
        ],
    )

    seller_name = _get_text(
        data,
        [
            "store_name",
            "seller_name",
            "seller",
            "seller_name_text",
            "merchant",
            "merchant_name",
            "vendor",
            "vendor_name",
            "sold_by",
        ],
    )

    seller_rating = _get_number(
        data,
        [
            "seller_rating",
            "seller_star_rating",
            "seller_rating_value",
            "seller_feedback_rating",
            "merchant_rating",
            "merchant_rating_value",
            "seller_score",
        ],
    )

    delivery_text = _get_text(
        data,
        [
            "delivery",
            "delivery_text",
            "delivery_info",
            "delivery_information",
            "delivery_details",
            "delivery_message",
            "delivery_date",
            "estimated_delivery",
            "estimated_delivery_date",
            "shipping",
            "shipping_text",
            "shipping_info",
            "shipping_information",
            "shipping_details",
            "arrival",
            "arrives",
            "expected_delivery",
        ],
    )

    offer_text = _get_text(
        data,
        [
            "offer_text",
            "offer",
            "offers",
            "deal",
            "deal_text",
            "promotion",
            "promotions",
            "coupon",
            "coupon_text",
            "discount",
            "discount_text",
            "bank_offer",
            "bank_offers",
        ],
    )

    description = _get_text(
        data,
        [
            "description",
            "product_description",
            "about_product",
            "about_this_item",
            "features",
            "highlights",
            "product_details",
            "overview",
        ],
    )

    category = _get_text(
        data,
        [
            "product_category",
            "category",
            "category_name",
            "product_type",
            "department",
            "breadcrumb",
            "breadcrumbs",
        ],
    )

    return_window = _get_field(
        data,
        [
            "return_window",
            "return_period",
            "return_days",
            "return_policy_days",
            "returnable_days",
        ]
    )

    if return_window is not None:

        return_window = _integer(
            return_window,
            default=None
        )

    color = _get_text(
        data,
        [
            "color",
            "colour",
            "variant_color",
            "color_name",
        ],
        default=None
    )

    size = _get_text(
        data,
        [
            "size",
            "variant_size",
            "size_name",
            "storage",
            "storage_capacity",
            "ram",
        ],
        default=None
    )

    item_id = _get_text(
        data,
        [
            "item_id",
            "sku",
            "variant_id",
            "product_id",
        ],
        default=None
    )

    return {
        "platform": "Flipkart",
        "title": title,
        "url": _normalise_url(
            _get_text(
                data,
                [
                    "url",
                    "product_url",
                    "product_page_url",
                    "link",
                    "product_link",
                ],
                default=original_url,
            )
        ),
        "price": price,
        "original_price": original_price,
        "rating": rating,
        "review_count": review_count,
        "availability": availability,
        "image_url": image_url,
        "description": description,
        "brand": brand,
        "model_number": model_number,
        "seller_name": seller_name,
        "seller_rating": seller_rating,
        "delivery_text": delivery_text,
        "offer_text": offer_text,
        "category": category,
        "return_window": return_window,
        "color": color,
        "size": size,
        "item_id": item_id,
        "scraped_at": datetime.utcnow().isoformat(),
        "snapshot_id": data.get("snapshot_id"),
    }


# =========================================================
# NORMALIZE PRODUCT URL
# =========================================================

def scrape_product_url(url):

    url = _normalise_url(url)

    if not url.startswith(
        ("http://", "https://")
    ):
        raise ValueError(
            "A valid http/https URL is required"
        )

    platform = detect_platform(url)

    print()
    print("==========================================")
    print("SmartBuy Product Scraper")
    print("==========================================")
    print("Platform:", platform)
    print("URL:", url)
    print("==========================================")

    snapshot_id = _trigger_product_url(
        url,
        platform
    )

    raw_data = _get_snapshot(
        snapshot_id
    )

    # Search/product snapshots can sometimes return
    # a list. Product URL scraper expects one result.
    if isinstance(raw_data, list):

        if not raw_data:
            raise ValueError(
                "Bright Data returned no product data"
            )

        raw_data = raw_data[0]

    if not isinstance(raw_data, dict):

        raise ValueError(
            "Invalid Bright Data product response"
        )

    raw_data["snapshot_id"] = snapshot_id

    if platform == "Amazon":

        result = _normalize_amazon(
            raw_data,
            url
        )

    elif platform == "Flipkart":

        result = _normalize_flipkart(
            raw_data,
            url
        )

    else:

        raise ValueError(
            f"Unsupported platform: {platform}"
        )

    print()
    print("==========================================")
    print("NORMALIZED RESULT")
    print("==========================================")

    for key, value in result.items():
        print(
            f"{key}: {value}"
        )

    print("==========================================")

    return result


# =========================================================
# SEARCH DATASETS
# =========================================================

def _build_search_payload(query, platform, pages=1):

    if platform == "Amazon":

        return [
            {
                "keyword": query,
                "url": "https://www.amazon.in",
                "pages_to_search": pages
            }
        ]

    if platform == "Flipkart":

        search_url = (
            "https://www.flipkart.com/search?q="
            + quote_plus(query)
            + "&otracker=search&otracker1=search"
            + "&marketplace=FLIPKART&as-show=on&as=off"
        )

        return [
            {
                "url": search_url,
                "page": 1
            }
        ]

    raise ValueError(
        f"Unsupported platform: {platform}"
    )


def search_platform(query, platform, pages=1):

    query = str(query).strip()

    if not query:
        raise ValueError(
            "Search query cannot be empty"
        )

    if platform not in [
        "Amazon",
        "Flipkart"
    ]:
        raise ValueError(
            "Currently only Amazon and Flipkart "
            "search are supported"
        )

    dataset_id = _get_search_dataset_id(
        platform
    )

    payload = _build_search_payload(
        query,
        platform,
        pages
    )

    print()
    print("==========================================")
    print("SmartBuy Search")
    print("==========================================")
    print("Platform:", platform)
    print("Query:", query)
    print("Dataset:", dataset_id)
    print("Payload:", payload)
    print("==========================================")

    snapshot_id = _trigger_dataset(
        dataset_id,
        payload
    )

    raw_data = _get_snapshot(
        snapshot_id
    )

    if isinstance(raw_data, dict):
        raw_data = [raw_data]

    if not isinstance(raw_data, list):
        return []

    normalized_results = []

    for item in raw_data:

        if not isinstance(item, dict):
            continue

        if item.get("error"):
            continue

        item["snapshot_id"] = snapshot_id

        try:

            if platform == "Amazon":
                result = _normalize_search_amazon(
                    item
                )

            else:
                result = _normalize_search_flipkart(
                    item
                )

            if result:
                normalized_results.append(
                    result
                )

        except Exception as exc:

            print(
                "[SmartBuy] Search item skipped:",
                exc
            )

    print(
        f"[SmartBuy] {platform} search returned "
        f"{len(normalized_results)} products"
    )

    if normalized_results:
        print(
            f"[SmartBuy] {platform} first product: "
            f"{normalized_results[0].get('title')}"
        )

    return normalized_results


# =========================================================
# SEARCH NORMALIZERS
# =========================================================

def _normalize_search_amazon(data):

    title = _get_text(
        data,
        [
            "title",
            "name",
            "product_name",
            "product_title",
            "item_name"
        ],
        default=None
    )

    if not title:
        return None

    price = _get_number(
        data,
        [
            "final_price",
            "sale_price",
            "selling_price",
            "current_price",
            "price",
            "deal_price"
        ]
    )

    rating = _get_number(
        data,
        [
            "rating",
            "star_rating",
            "stars"
        ]
    )

    review_count = _integer(
        _get_field(
            data,
            [
                "review_count",
                "reviews_count",
                "rating_count",
                "ratings_total"
            ]
        ),
        0
    )

    brand = _get_text(
        data,
        [
            "brand",
            "brand_name"
        ],
        default=None
    )

    image_url = _get_text(
        data,
        [
            "image",
            "image_url",
            "main_image",
            "thumbnail"
        ],
        default=None
    )

    url = _get_text(
        data,
        [
            "url",
            "product_url",
            "product_page_url",
            "link"
        ],
        default=None
    )

    asin = _get_text(
        data,
        [
            "asin"
        ],
        default=None
    )

    model_number = _get_text(
        data,
        [
            "model_number",
            "model",
            "sku",
            "product_id",
            "asin"
        ],
        default=None
    )

    color = _get_text(
        data,
        [
            "color",
            "colour"
        ],
        default=None
    )

    size = _get_text(
        data,
        [
            "size",
            "storage",
            "storage_capacity"
        ],
        default=None
    )

    return {
        "platform": "Amazon",
        "title": title,
        "url": url,
        "price": price,
        "rating": rating,
        "review_count": review_count,
        "brand": brand,
        "image_url": image_url,
        "model_number": model_number,
        "color": color,
        "size": size,
        "asin": asin,
        "availability": _get_text(
            data,
            ["availability", "stock"],
            default=None
        ),
        "normalized_name": normalize_product_name(
            title
        ),
        "raw": data,
    }


def _normalize_search_flipkart(data):

    title = _get_text(
        data,
        [
            "name",
            "title",
            "product_name",
            "product_title"
        ],
        default=None
    )

    if not title:
        return None

    price = _get_number(
        data,
        [
            "sale_price",
            "selling_price",
            "sellingprice",
            "current_price",
            "price",
            "final_price"
        ]
    )

    rating = _get_number(
        data,
        [
            "star_rating",
            "rating",
            "stars"
        ]
    )

    review_count = _integer(
        _get_field(
            data,
            [
                "review_count",
                "reviews_count",
                "rating_count",
                "ratings_total"
            ]
        ),
        0
    )

    brand = _get_text(
        data,
        [
            "brand",
            "brand_name"
        ],
        default=None
    )

    image_url = _get_text(
        data,
        [
            "image_url",
            "image",
            "thumbnail"
        ],
        default=None
    )

    url = _get_text(
        data,
        [
            "url",
            "product_url",
            "product_page_url",
            "link"
        ],
        default=None
    )

    model_number = _get_text(
        data,
        [
            "model_number",
            "model",
            "sku",
            "item_id",
            "product_id",
            "variant_id"
        ],
        default=None
    )

    color = _get_text(
        data,
        [
            "color",
            "colour"
        ],
        default=None
    )

    size = _get_text(
        data,
        [
            "size",
            "storage",
            "storage_capacity"
        ],
        default=None
    )

    return {
        "platform": "Flipkart",
        "title": title,
        "url": url,
        "price": price,
        "rating": rating,
        "review_count": review_count,
        "brand": brand,
        "image_url": image_url,
        "model_number": model_number,
        "color": color,
        "size": size,
        "item_id": _get_text(
            data,
            [
                "item_id",
                "sku",
                "variant_id"
            ],
            default=None
        ),
        "availability": _get_text(
            data,
            [
                "availability",
                "stock"
            ],
            default=None
        ),
        "normalized_name": normalize_product_name(
            title
        ),
        "raw": data,
    }


# =========================================================
# VARIANT EXTRACTION
# =========================================================

def extract_variant_attributes(item):

    title = str(
        item.get("title") or ""
    )

    text = title.lower()

    attributes = {}

    # -----------------------------------------------------
    # STORAGE
    # -----------------------------------------------------

    storage_patterns = [
        r"\b(\d+)\s*tb\b",
        r"\b(\d+)\s*gb\b",
        r"\b(\d+)\s*mb\b",
    ]

    storage_values = []

    for pattern in storage_patterns:

        matches = re.findall(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        for value in matches:
            storage_values.append(
                value.upper()
            )

    if storage_values:

        attributes["storage"] = "/".join(
            storage_values
        )

    # -----------------------------------------------------
    # RAM
    # -----------------------------------------------------

    ram_patterns = [
        r"\b(\d+)\s*gb\s*ram\b",
        r"\bram\s*(\d+)\s*gb\b",
    ]

    for pattern in ram_patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            attributes["ram"] = (
                match.group(1) + "GB"
            )

            break

    # -----------------------------------------------------
    # COLOR
    # -----------------------------------------------------

    color = item.get("color")

    if color:
        attributes["color"] = str(
            color
        ).strip().lower()

    # -----------------------------------------------------
    # SIZE
    # -----------------------------------------------------

    size = item.get("size")

    if size:
        attributes["size"] = str(
            size
        ).strip().lower()

    # -----------------------------------------------------
    # PROCESSOR
    # -----------------------------------------------------

    processor_patterns = [
        r"ryzen\s+\d",
        r"core\s+i[3579]",
        r"i[3579]-\d+",
        r"snapdragon\s+\w+",
        r"apple\s+m[123456]",
    ]

    for pattern in processor_patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            attributes["processor"] = (
                match.group(0)
                .lower()
                .strip()
            )

            break

    # -----------------------------------------------------
    # MODEL NUMBER
    # -----------------------------------------------------

    model = item.get(
        "model_number"
    )

    if model:
        attributes["model_number"] = (
            str(model)
            .strip()
            .lower()
        )

    return attributes


# =========================================================
# VARIANT KEY
# =========================================================

def build_variant_key(item):

    attributes = extract_variant_attributes(
        item
    )

    brand = str(
        item.get("brand") or ""
    ).lower().strip()

    normalized_title = normalize_product_name(
        item.get("title") or ""
    )

    # Remove generic words which should not
    # separate identical products.
    normalized_title = re.sub(
        r"\b(amazon|flipkart|laptop|mobile|phone)\b",
        "",
        normalized_title
    )

    parts = [
        brand,
        normalized_title,
    ]

    for key in [
        "model_number",
        "processor",
        "ram",
        "storage",
        "color",
        "size",
    ]:

        value = attributes.get(key)

        if value:
            parts.append(
                f"{key}:{value}"
            )

    return "|".join(
        part for part in parts
        if part
    )


# =========================================================
# CROSS PLATFORM MATCHING
# =========================================================

def match_cross_platform_products(
    amazon_products,
    flipkart_products
):

    matches = []

    used_flipkart = set()

    for amazon in amazon_products:

        best_match = None
        best_score = 0

        amazon_key = build_variant_key(
            amazon
        )

        amazon_title = normalize_product_name(
            amazon.get("title") or ""
        )

        amazon_model = str(
            amazon.get("model_number") or ""
        ).lower().strip()

        amazon_brand = str(
            amazon.get("brand") or ""
        ).lower().strip()

        for index, flipkart in enumerate(
            flipkart_products
        ):

            if index in used_flipkart:
                continue

            flipkart_title = normalize_product_name(
                flipkart.get("title") or ""
            )

            flipkart_model = str(
                flipkart.get("model_number") or ""
            ).lower().strip()

            flipkart_brand = str(
                flipkart.get("brand") or ""
            ).lower().strip()

            flipkart_key = build_variant_key(
                flipkart
            )

            score = 0

            # Exact model match
            if (
                amazon_model
                and flipkart_model
                and amazon_model == flipkart_model
            ):
                score += 60

            # Same brand
            if (
                amazon_brand
                and flipkart_brand
                and amazon_brand == flipkart_brand
            ):
                score += 15

            # Exact variant key
            if (
                amazon_key
                and flipkart_key
                and amazon_key == flipkart_key
            ):
                score += 25

            # Normalized title similarity
            amazon_words = set(
                amazon_title.split()
            )

            flipkart_words = set(
                flipkart_title.split()
            )

            if amazon_words and flipkart_words:

                intersection = (
                    amazon_words
                    & flipkart_words
                )

                union = (
                    amazon_words
                    | flipkart_words
                )

                similarity = (
                    len(intersection)
                    / max(len(union), 1)
                )

                score += similarity * 40

            if score > best_score:

                best_score = score
                best_match = flipkart

        # Only consider reasonably strong matches.
        if best_match and best_score >= 45:

            flipkart_index = flipkart_products.index(
                best_match
            )

            used_flipkart.add(
                flipkart_index
            )

            matches.append({
                "variant_key": amazon_key,
                "match_score": round(
                    best_score,
                    2
                ),
                "amazon": amazon,
                "flipkart": best_match,
            })

    return matches


# =========================================================
# FULL SMARTBUY SEARCH
# =========================================================

def search_products(query, pages=1):

    query = str(query).strip()

    if not query:

        raise ValueError(
            "Search query is required"
        )

    print()
    print("==========================================")
    print("SMARTBUY CROSS-PLATFORM SEARCH")
    print("==========================================")
    print("Query:", query)
    print("==========================================")

    amazon_products = search_platform(
        query,
        "Amazon",
        pages
    )

    flipkart_products = search_platform(
        query,
        "Flipkart",
        pages
    )

    matches = match_cross_platform_products(
        amazon_products,
        flipkart_products
    )

    return {
        "query": query,
        "amazon": amazon_products,
        "flipkart": flipkart_products,
        "matches": matches,
        "counts": {
            "amazon": len(amazon_products),
            "flipkart": len(flipkart_products),
            "matched_variants": len(matches),
        }
    }


# =========================================================
# DATABASE STORAGE
# =========================================================

def upsert_scraped_offer(data):

    title = data["title"].strip()

    normalized = normalize_product_name(
        title
    )

    product = None

    model_number = data.get(
        "model_number"
    )

    # -----------------------------------------------------
    # SEARCH BY MODEL
    # -----------------------------------------------------

    if (
        model_number
        and model_number != "Not available"
    ):

        product = Product.query.filter_by(
            model_number=str(model_number)
        ).first()

    # -----------------------------------------------------
    # SEARCH BY NORMALIZED NAME
    # -----------------------------------------------------

    if not product and normalized:

        product = Product.query.filter_by(
            normalized_name=normalized
        ).first()

    # -----------------------------------------------------
    # CREATE PRODUCT
    # -----------------------------------------------------

    if not product:

        product = Product(
            name=title,
            normalized_name=normalized,

            brand=(
                data.get("brand")
                if data.get("brand")
                != "Not available"
                else None
            ),

            model_number=(
                str(model_number)
                if (
                    model_number
                    and model_number
                    != "Not available"
                )
                else None
            ),

            image_url=(
                data.get("image_url")
                if data.get("image_url")
                != "Not available"
                else None
            ),

            description=(
                data.get("description")
                if data.get("description")
                != "Not available"
                else None
            ),
        )

        db.session.add(product)

        db.session.flush()

    # -----------------------------------------------------
    # UPDATE MISSING PRODUCT FIELDS
    # -----------------------------------------------------

    else:

        if (
            not product.brand
            and data.get("brand")
            != "Not available"
        ):

            product.brand = data.get(
                "brand"
            )

        if not product.model_number:

            if (
                model_number
                and model_number
                != "Not available"
            ):

                product.model_number = str(
                    model_number
                )

        if not product.image_url:

            image_url = data.get(
                "image_url"
            )

            if (
                image_url
                and image_url
                != "Not available"
            ):

                product.image_url = image_url

        if not product.description:

            description = data.get(
                "description"
            )

            if (
                description
                and description
                != "Not available"
            ):

                product.description = description

    # -----------------------------------------------------
    # PRICE
    # -----------------------------------------------------

    if data.get("price") is None:

        raise ValueError(
            "This product currently has no available price"
        )

    try:

        price = Decimal(
            str(data["price"])
        )

    except (
        InvalidOperation,
        TypeError,
        ValueError
    ):

        raise ValueError(
            "Invalid scraped price"
        )

    # -----------------------------------------------------
    # FIND EXISTING OFFER
    # -----------------------------------------------------

    offer = Offer.query.filter_by(
        product_id=product.id,
        platform=data["platform"],
        url=data["url"],
    ).first()

    # -----------------------------------------------------
    # UPDATE OFFER
    # -----------------------------------------------------

    if offer:

        offer.price = price
        offer.title = title

        if data.get("original_price") is not None:
            offer.original_price = data[
                "original_price"
            ]

        if data.get("rating") is not None:
            offer.rating = data[
                "rating"
            ]

        offer.review_count = data.get(
            "review_count",
            0
        )

        offer.availability = data.get(
            "availability"
        )

        offer.last_checked = datetime.utcnow()

        if hasattr(
            offer,
            "seller_name"
        ):
            offer.seller_name = data.get(
                "seller_name"
            )

        if hasattr(
            offer,
            "seller_rating"
        ):
            offer.seller_rating = data.get(
                "seller_rating"
            )

        if hasattr(
            offer,
            "delivery_text"
        ):
            offer.delivery_text = data.get(
                "delivery_text"
            )

        if hasattr(
            offer,
            "offer_text"
        ):
            offer.offer_text = data.get(
                "offer_text"
            )

    # -----------------------------------------------------
    # CREATE OFFER
    # -----------------------------------------------------

    else:

        offer = Offer(
            product_id=product.id,
            platform=data["platform"],
            title=title,
            url=data["url"],
            price=price,
            original_price=data.get(
                "original_price"
            ),
            rating=data.get(
                "rating"
            ),
            review_count=data.get(
                "review_count",
                0
            ),
            availability=data.get(
                "availability"
            ),
            last_checked=datetime.utcnow(),
        )

        if hasattr(
            offer,
            "seller_name"
        ):
            offer.seller_name = data.get(
                "seller_name"
            )

        if hasattr(
            offer,
            "seller_rating"
        ):
            offer.seller_rating = data.get(
                "seller_rating"
            )

        if hasattr(
            offer,
            "delivery_text"
        ):
            offer.delivery_text = data.get(
                "delivery_text"
            )

        if hasattr(
            offer,
            "offer_text"
        ):
            offer.offer_text = data.get(
                "offer_text"
            )

        db.session.add(offer)

        db.session.flush()

    # -----------------------------------------------------
    # PRICE HISTORY
    # -----------------------------------------------------

    db.session.add(
        PriceHistory(
            offer_id=offer.id,
            price=price
        )
    )

    db.session.commit()

    return product, offer
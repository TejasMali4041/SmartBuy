"""
SmartBuy Production Cross-Platform Product Matcher

Purpose
-------
Match the same underlying product across marketplaces when titles, attributes,
and descriptions are not identical, while strongly rejecting accessories,
spare parts, unrelated model tiers, and cross-category false positives.

Design goals
------------
1. Category-independent: no phone/laptop-only assumptions.
2. High precision first: accessories/parts are filtered before similarity.
3. High recall within a product family: color, capacity, RAM, storage, etc.
   are variants and normally do not prevent a family match.
4. Multiple evidence sources: brand, model/family, identity tokens, category,
   title similarity, character similarity, and structured attributes.
5. One-to-one assignment: one marketplace listing cannot be matched twice.
6. Explainable scores and rejection reasons for debugging/demo purposes.

Public API (kept compatible with SmartBuy live_search.py)
----------------------------------------------------------
    calculate_pair_match(product_a, product_b, known_brands=None)
    match_products(source_products, target_products, min_score=62)
    match_all(amazon_products, flipkart_products, min_score=62)
    explain_matches(matches)

The scraper is deliberately NOT imported or modified here.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

GENERIC_WORDS = {
    "new", "latest", "original", "genuine", "official", "sale", "offer",
    "best", "buy", "online", "product", "item", "available", "free",
    "shipping", "delivery", "with", "for", "the", "and", "from", "by",
    "pack", "piece", "pieces", "set", "combo", "kit", "amazon", "flipkart",
    "meesho", "myntra", "india", "indian", "discount", "deal", "colour",
    "color", "model", "number", "no", "nos", "includes", "included",
    "newest", "officially", "saleprice", "dealprice",
}

AUDIENCE_WORDS = {
    "men", "mens", "man", "male", "women", "womens", "woman", "female",
    "unisex", "boys", "boy", "girls", "girl", "kids", "kid", "child",
    "children", "adult", "baby", "babies", "junior", "senior",
}

MARKETPLACE_ID_KEYS = {
    "asin", "sku", "item_id", "item_number", "variant_id", "listing_id",
    "product_id", "offer_id", "rootdomain", "timestamp", "rank", "page",
}

GLOBAL_IDENTIFIER_KEYS = {
    "gtin", "ean", "ean13", "upc", "upc_a", "barcode", "isbn", "isbn10",
    "isbn13", "mpn", "manufacturer_part_number", "part_number",
}

ATTRIBUTE_ALIASES = {
    "brand": ["brand", "brand_name", "manufacturer", "maker"],
    "model": ["model", "model_number", "model_name", "mpn", "part_number"],
    "category": ["product_type", "type", "category", "subcategory", "department"],
    "color": ["color", "colour"],
    "size": ["size", "shoe_size", "clothing_size", "variant_size", "size_name"],
    "material": ["material", "fabric", "construction"],
    "gender": ["gender", "target_gender"],
    "author": ["author", "authors", "writer"],
    "isbn": ["isbn", "isbn10", "isbn13"],
    "gtin": ["gtin", "ean", "upc", "barcode", "ean13", "upc_a"],
}

# Words that are mostly presentation/features, not the named product identity.
PRESENTATION_WORDS = {
    "fully", "automatic", "semi", "auto", "top", "load", "front", "door",
    "digital", "display", "smart", "inverter", "energy", "efficient", "star",
    "stars", "premium", "advanced", "powerful", "performance", "stylish",
    "design", "long", "lasting", "battery", "life", "fast", "quick", "hard",
    "soft", "water", "technology", "tech", "edition", "special", "limited",
    "series", "generation", "gen", "wireless", "bluetooth", "compatible",
    "connectivity", "portable", "professional", "classic", "standard", "plus",
    "smart", "digital", "pro", "max", "ultra", "lite", "mini", "se", "fe",
    "edge", "elite", "prime", "studio", "go", "core", "5g", "4g", "wifi",
}

# Variant words/spec markers. They should usually not be used as the family
# identity, because marketplaces commonly expose each variant separately.
VARIANT_WORDS = {
    "white", "black", "red", "blue", "green", "yellow", "pink", "purple",
    "grey", "gray", "silver", "gold", "orange", "brown", "navy", "beige",
    "midnight", "indigo", "starlight", "cosmic", "camo", "multicolor",
    "jetblack", "icyblue", "shadow", "cream", "violet", "graphite", "lavender",
}

MODEL_TIER_WORDS = {
    "pro", "max", "ultra", "plus", "edge", "mini", "lite", "se", "fe",
    "core", "elite", "prime", "studio", "go", "air", "play", "active",
}

NON_MANUFACTURER_BRAND_WORDS = {
    "playstation", "ps5", "ps4", "ps3", "ps2", "xbox", "android", "ios",
    "windows", "mac", "macos", "fire", "kindle", "google", "chrome",
}

# ---------------------------------------------------------------------------
# Product roles / accessory protection
# ---------------------------------------------------------------------------

# A role is intentionally broader than a category. The critical distinction is
# MAIN_PRODUCT vs ACCESSORY/PART. Category-specific words then refine it.
ROLE_ACCESSORY_WORDS = {
    # covers / protection
    "case", "cover", "shell", "skin", "protector", "protective", "sleeve",
    "sticker", "film", "guard", "bumper", "pouch", "holster",
    # charging / power / mounting
    "charger", "charging", "dock", "station", "adapter", "cable", "wire",
    "stand", "mount", "holder", "bracket", "trolley", "pedestal", "rack",
    "tripod", "strap", "wristband", "band",
    # replacement / spare parts
    "replacement", "spare", "part", "parts", "component", "module", "repair",
    "capacitor", "condenser", "inlet", "outlet", "valve", "pump", "belt",
    "hose", "filter", "pcb", "board", "motor", "drum", "pulsator", "agitator",
    "bearing", "seal", "switch", "button", "screen", "panel", "display",
    "battery", "lens", "remote", "controller", "joystick", "analog", "thumb",
    "grip", "earpad", "earpads", "earcup", "earcups", "replacementpad",
    # consumables / add-ons
    "ink", "toner", "cartridge", "refill", "detergent", "cleaner",
}

# Some words above can be a legitimate main product (e.g. controller, remote).
# These are main-product anchors and therefore get special handling.
MAIN_PRODUCT_ANCHORS = {
    "phone", "smartphone", "mobile", "laptop", "notebook", "tablet", "desktop",
    "computer", "monitor", "television", "tv", "camera", "headphones", "earbuds",
    "earphone", "earphones", "speaker", "watch", "smartwatch", "controller",
    "gamepad", "console", "joystick", "keyboard", "mouse", "printer", "projector",
    "shoe", "shoes", "sneaker", "sneakers", "boots", "sandals", "shirt", "tshirt",
    "jeans", "dress", "jacket", "hoodie", "trouser", "pants", "book", "chair",
    "table", "sofa", "mattress", "refrigerator", "fridge", "freezer", "washing",
    "machine", "washer", "dryer", "dishwasher", "microwave", "oven", "airconditioner",
    "conditioner", "fan", "cooler", "vacuum", "iron", "kettle", "mixer", "grinder",
    "toaster", "airfryer", "blender", "waterpurifier", "purifier", "geyser", "heater",
    "bicycle", "cycle", "treadmill", "camera", "lens",
}

# Specific category signatures. Longest/specific categories are evaluated first.
CATEGORY_SIGNATURES = [
    ("washing_machine", {"washing machine", "washer", "washing"}),
    ("dishwasher", {"dishwasher"}),
    ("refrigerator", {"refrigerator", "fridge", "freezer"}),
    ("air_conditioner", {"air conditioner", "airconditioner", "split ac", "window ac"}),
    ("air_cooler", {"air cooler", "aircooler", "cooler"}),
    ("water_purifier", {"water purifier", "waterpurifier"}),
    ("microwave", {"microwave"}),
    ("oven", {"oven"}),
    ("vacuum_cleaner", {"vacuum cleaner", "vacuum"}),
    ("television", {"television", "smart tv", "tv"}),
    ("smartphone", {"smartphone", "mobile phone", "mobile", "phone"}),
    ("laptop", {"laptop", "notebook"}),
    ("tablet", {"tablet"}),
    ("desktop", {"desktop", "pc"}),
    ("monitor", {"monitor", "display"}),
    ("camera", {"digital camera", "mirrorless", "dslr", "camera"}),
    ("headphones", {"headphones", "headphone"}),
    ("earbuds", {"earbuds", "earphones", "earphone", "tws"}),
    ("speaker", {"speaker", "soundbar"}),
    ("smartwatch", {"smartwatch", "smart watch"}),
    ("watch", {"watch"}),
    ("gaming_console", {"playstation", "xbox", "gaming console", "console"}),
    ("game_controller", {"controller", "gamepad", "joystick"}),
    ("keyboard", {"keyboard"}),
    ("mouse", {"mouse"}),
    ("printer", {"printer"}),
    ("projector", {"projector"}),
    ("shoe", {"shoe", "shoes", "sneaker", "sneakers", "boots", "sandals", "slippers"}),
    ("clothing", {"shirt", "tshirt", "jeans", "dress", "jacket", "hoodie", "pants", "trouser"}),
    ("book", {"book", "paperback", "hardcover", "novel"}),
    ("furniture", {"chair", "table", "sofa", "mattress", "bed", "desk"}),
    ("personal_care", {"shampoo", "conditioner", "serum", "cream", "perfume", "fragrance", "lipstick"}),
    ("kitchen_appliance", {"mixer", "grinder", "blender", "toaster", "kettle", "air fryer", "airfryer", "iron"}),
    ("fitness", {"treadmill", "exercise bike", "bicycle", "dumbbell", "yoga mat"}),
]

CATEGORY_WORDS = set()
for _, phrases in CATEGORY_SIGNATURES:
    for phrase in phrases:
        CATEGORY_WORDS.update(phrase.split())

SPEC_STARTERS = {
    "gb", "tb", "gib", "mah", "ml", "hz", "inch", "inches", "ssd", "hdd",
    "ram", "memory", "storage", "processor", "display", "camera", "capacity",
    "kg", "litre", "liter", "rpm", "watt", "watts", "voltage", "volt", "v",
}

FEATURE_NOISE = {
    "fully", "automatic", "semi", "auto", "top", "load", "front", "door", "digital",
    "display", "star", "stars", "rated", "energy", "efficient", "premium", "advanced",
    "powerful", "performance", "stylish", "design", "long", "lasting", "battery", "life",
    "technology", "technology", "hard", "soft", "water", "zero", "pressure", "ai",
    "powered", "smart", "connectivity", "connection", "fast", "quick", "portable",
    "original", "latest", "new", "genuine", "official", "with", "for", "and", "the",
}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).lower().strip()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9.]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _compact(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", _clean_text(value))


def _first_value(product: Dict[str, Any], aliases: Iterable[str]) -> Optional[str]:
    for key in aliases:
        value = product.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _combined_text(product: Dict[str, Any]) -> str:
    parts: List[str] = []
    for key in (
        "title", "name", "description", "product_category", "category", "department",
        "features", "highlights", "specifications", "specification", "product_details",
    ):
        value = product.get(key)
        if value:
            parts.append(str(value))
    raw = product.get("raw")
    if isinstance(raw, dict):
        for key in ("title", "name", "description", "features", "highlights", "specifications", "category"):
            if raw.get(key):
                parts.append(str(raw[key]))
    return " ".join(parts)


def _title(product: Dict[str, Any]) -> str:
    return _clean_text(product.get("title") or product.get("name"))


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", _clean_text(text))


def _token_set(text: str) -> Set[str]:
    return set(_tokenize(text))


# ---------------------------------------------------------------------------
# Category + role detection
# ---------------------------------------------------------------------------

def _contains_phrase(text: str, phrase: str) -> bool:
    pattern = r"\b" + r"\s+".join(re.escape(x) for x in phrase.split()) + r"\b"
    return bool(re.search(pattern, text))


def detect_category(product: Dict[str, Any]) -> str:
    text = _clean_text(_combined_text(product))

    # A specific accessory category is deliberately separate from its parent
    # category. This is the core fix for washing-machine stands/capacitors/etc.
    role = _detect_role(product)
    if role == "accessory":
        if _contains_phrase(text, "washing machine") or "washer" in text or "washing" in text:
            return "washing_machine_accessory"
        if any(x in text for x in ("phone", "smartphone", "mobile", "galaxy", "iphone")):
            return "phone_accessory"
        if any(x in text for x in ("laptop", "notebook", "macbook")):
            return "laptop_accessory"
        if any(x in text for x in ("tv", "television", "monitor")):
            return "display_accessory"
        if any(x in text for x in ("camera", "dslr", "mirrorless")):
            return "camera_accessory"
        if any(x in text for x in ("controller", "gamepad", "playstation", "xbox")):
            return "gaming_accessory"
        return "generic_accessory"

    for category, phrases in CATEGORY_SIGNATURES:
        if any(_contains_phrase(text, phrase) for phrase in phrases):
            return category
    return "general"


def _detect_role(product: Dict[str, Any]) -> str:
    text = _clean_text(_combined_text(product))
    tokens = set(_tokenize(text))

    # Multi-word accessory phrases have priority.
    strong_phrases = (
        "washing machine stand", "washing machine trolley", "washing machine cover",
        "washing machine capacitor", "washing machine inlet valve", "washing machine drain pump",
        "replacement part", "spare part", "replacement battery", "charging station",
        "protective case", "protective cover", "screen protector", "laptop stand",
        "phone case", "phone cover", "camera tripod", "replacement remote",
    )
    if any(_contains_phrase(text, p) for p in strong_phrases):
        return "accessory"

    # Standalone accessory words are strong evidence unless the item is itself
    # a known main-product anchor (e.g. a game controller).
    accessory_hits = tokens & ROLE_ACCESSORY_WORDS
    main_hits = tokens & MAIN_PRODUCT_ANCHORS

    # Explicit spare-part language always wins.
    if tokens & {"replacement", "spare", "capacitor", "condenser", "valve", "pump", "belt",
                 "pulsator", "agitator", "bearing", "seal", "pcb", "module", "cartridge",
                 "toner", "refill", "inlet", "outlet"}:
        return "accessory"

    if accessory_hits:
        # A product whose title is explicitly a controller/remote is a main
        # product, but a "controller charging station" remains an accessory.
        if "controller" in main_hits or "remote" in main_hits:
            non_main_accessory = accessory_hits - {"controller", "remote"}
            if non_main_accessory:
                return "accessory"
            return "main"
        return "accessory"

    if main_hits:
        return "main"

    # A generic product without clear role is left neutral rather than falsely
    # assigning it to an accessory class.
    return "unknown"


# ---------------------------------------------------------------------------
# Attribute extraction
# ---------------------------------------------------------------------------

def _extract_quantity_attributes(text: str) -> Dict[str, str]:
    text = _clean_text(text)
    attrs: Dict[str, str] = {}

    patterns = {
        "ram": r"\b(\d+)\s*(?:gb|gib)\s*(?:ram|memory)\b",
        "storage": r"\b(\d+(?:\.\d+)?)\s*(tb|gb)\s*(?:ssd|hdd|storage)\b(?!\s*ram)",
        "screen_size": r"\b(\d+(?:\.\d+)?)\s*(?:inch|inches)\b",
        "refresh_rate": r"\b(\d+)\s*hz\b",
        "capacity_kg": r"\b(\d+(?:\.\d+)?)\s*kg\b",
        "capacity_l": r"\b(\d+(?:\.\d+)?)\s*(?:l|litre|liter)\b",
        "battery": r"\b(\d+(?:\.\d+)?)\s*mah\b",
        "power": r"\b(\d+(?:\.\d+)?)\s*(?:w|watt|watts)\b",
        "rpm": r"\b(\d+)\s*rpm\b",
    }
    for key, pattern in patterns.items():
        m = re.search(pattern, text)
        if m:
            attrs[key] = " ".join(m.groups())

    processor_patterns = (
        r"\b((?:intel\s+)?core\s+i[3579](?:[- ]?[a-z]?\d{3,5}[a-z]{0,3})?)\b",
        r"\b(ryzen\s+[3579](?:[- ]?\d{3,5}[a-z]{0,3})?)\b",
        r"\b(snapdragon\s+[a-z0-9-]+(?:\s+(?:elite|gen\s*\d+))?)\b",
        r"\b(apple\s+m[1-5](?:\s+(?:pro|max|ultra))?)\b",
    )
    for pattern in processor_patterns:
        m = re.search(pattern, text)
        if m:
            attrs["processor"] = _clean_text(m.group(1))
            break

    gpu = re.search(
        r"\b((?:nvidia\s+)?(?:geforce\s+)?(?:rtx|gtx)\s*\d{3,4}(?:\s*ti|\s*super)?)\b",
        text,
    )
    if gpu:
        attrs["gpu"] = _clean_text(gpu.group(1))

    # Storage can also appear as "256 GB" without the word storage.
    if "storage" not in attrs:
        for m in re.finditer(r"\b(64|128|256|512|1024|2048)\s*(gb|tb)\b", text):
            after = text[m.end():m.end() + 12]
            before = text[max(0, m.start() - 12):m.start()]
            if re.search(r"\b(ram|memory)\b", after):
                continue
            # A preceding number + GB RAM pattern is not storage.
            if re.search(r"\b(ram|memory)\s*$", before):
                continue
            attrs["storage"] = " ".join(m.groups())
            break

    return attrs


def _extract_generic_attributes(product: Dict[str, Any]) -> Dict[str, str]:
    attrs: Dict[str, str] = {}

    for canonical, aliases in ATTRIBUTE_ALIASES.items():
        value = _first_value(product, aliases)
        if value:
            attrs[canonical] = _clean_text(value)

    text = _clean_text(_combined_text(product))
    attrs.update(_extract_quantity_attributes(text))

    category = detect_category(product)
    if category == "shoe":
        m = re.search(r"\b(?:uk|us|eu)\s*(\d+(?:\.5)?)\b|\bsize\s*(\d+(?:\.5)?)\b", text)
        if m:
            attrs["shoe_size"] = next(g for g in m.groups() if g)

    # Structured model is more trustworthy than title inference.
    structured_model = _first_value(product, ["model_number", "model", "model_name", "mpn", "part_number"])
    if structured_model:
        attrs["structured_model"] = _clean_text(structured_model)

    # Manufacturer-style title model such as FA506NCG-HN251WS. Exclude obvious
    # marketplace IDs by requiring a plausible mixed alphanumeric form.
    title = str(product.get("title") or product.get("name") or "")
    for pattern in (
        r"\b[A-Z]{2,}[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\b",
        r"\b[A-Z]{2,}\d{2,}[A-Z]{1,}\d{1,}[A-Z0-9]*\b",
    ):
        m = re.search(pattern, title.upper())
        if m:
            candidate = _compact(m.group(0))
            # ASIN-like 10-character IDs and giant marketplace IDs are ignored.
            if len(candidate) >= 7 and not re.fullmatch(r"[A-Z0-9]{10}", candidate):
                attrs["title_model"] = _clean_text(m.group(0))
                break

    return attrs


def _identifier(product: Dict[str, Any], attrs: Dict[str, str]) -> Optional[str]:
    for key in GLOBAL_IDENTIFIER_KEYS:
        value = product.get(key)
        if value:
            return _compact(value)
    for key in ("gtin", "isbn"):
        if attrs.get(key):
            return _compact(attrs[key])
    return None


# ---------------------------------------------------------------------------
# Identity extraction
# ---------------------------------------------------------------------------

def _brand(product: Dict[str, Any]) -> str:
    return _clean_text(product.get("brand") or product.get("brand_name") or product.get("manufacturer"))


def _title_brand_guess(product: Dict[str, Any], known_brands: Optional[Set[str]] = None) -> Optional[str]:
    title = _title(product)
    tokens = _tokenize(title)
    known = sorted((known_brands or set()), key=len, reverse=True)
    for brand in known:
        if brand and brand not in NON_MANUFACTURER_BRAND_WORDS and _contains_phrase(title, brand):
            return brand

    # Conservative first-token guess only. Never use it alone as proof of identity.
    for token in tokens[:4]:
        if token in GENERIC_WORDS or token in AUDIENCE_WORDS or token in CATEGORY_WORDS:
            continue
        if token in NON_MANUFACTURER_BRAND_WORDS or re.search(r"\d", token):
            continue
        if len(token) >= 3:
            return token
    return None


def _brand_relation(a: Dict[str, Any], b: Dict[str, Any], known_brands: Optional[Set[str]] = None) -> Tuple[bool, bool, Optional[str]]:
    ba, bb = _brand(a), _brand(b)
    if ba and bb:
        return ba == bb, False, ba if ba == bb else None

    ia = ba or _title_brand_guess(a, known_brands)
    ib = bb or _title_brand_guess(b, known_brands)
    if ia and ib and ia == ib:
        return True, not (ba and bb), ia
    return False, bool(ia or ib), ia or ib


def _meaningful_identity_tokens(product: Dict[str, Any], known_brand: Optional[str] = None) -> Set[str]:
    title = _title(product)
    brand = _brand(product) or _clean_text(known_brand)
    brand_tokens = set(_tokenize(brand))

    tokens = _tokenize(title)
    result: Set[str] = set()
    for t in tokens:
        if t in GENERIC_WORDS or t in AUDIENCE_WORDS or t in brand_tokens:
            continue
        if t in CATEGORY_WORDS or t in PRESENTATION_WORDS or t in FEATURE_NOISE:
            continue
        if t in VARIANT_WORDS:
            continue
        # Standalone units/spec tokens are not identity.
        if t in SPEC_STARTERS:
            continue
        if re.fullmatch(r"\d+(?:\.\d+)?", t):
            continue
        # Common size/capacity tokens.
        if re.fullmatch(r"\d+(?:gb|tb|kg|mah|hz|rpm)", t):
            continue
        result.add(t)
    return result


def _numeric_model_tokens(product: Dict[str, Any]) -> Set[str]:
    tokens = _tokenize(_title(product))
    out: Set[str] = set()
    spec_re = re.compile(r"^\d+(?:gb|tb|kg|mah|hz|rpm|gib|ml|w|v)$")
    network_tokens = {"4g", "5g", "wifi", "6g"}
    for token in tokens:
        if token in network_tokens or spec_re.fullmatch(token):
            continue
        if re.search(r"[a-z]", token) and re.search(r"\d", token):
            if len(token) <= 12:
                digits = "".join(re.findall(r"\d+", token))
                if digits:
                    out.add(digits)
    return out


def _model_fingerprints(product: Dict[str, Any]) -> Set[str]:
    """Extract compact model-like fingerprints while tolerating punctuation/spacing.

    Examples:
        WH-1000XM5 -> wh1000xm5
        WH1000XM5  -> wh1000xm5
        FA506NCG-HN251WS -> fa506ncghn251ws
        A15 -> a15
        S25 -> s25

    These fingerprints are used as family evidence, never as marketplace IDs.
    """
    raw = str(product.get("title") or product.get("name") or "").lower()
    raw = raw.replace("&", " and ")
    fingerprints: Set[str] = set()
    compact_full = re.sub(r"[^a-z0-9]+", " ", raw)
    tokens = compact_full.split()
    spec_re = re.compile(r"^\d+(?:gb|tb|kg|mah|hz|rpm|gib|ml|w|v)$")
    network_tokens = {"4g", "5g", "wifi", "6g"}
    for token in tokens:
        if token in network_tokens or spec_re.fullmatch(token):
            continue
        if re.search(r"[a-z]", token) and re.search(r"\d", token) and 2 <= len(token) <= 20:
            fingerprints.add(token)
    # Join a short alpha token immediately before a numeric/alphanumeric token.
    for i in range(len(tokens) - 1):
        if (re.fullmatch(r"[a-z]{1,6}", tokens[i])
                and re.search(r"\d", tokens[i + 1])
                and tokens[i + 1] not in network_tokens
                and not spec_re.fullmatch(tokens[i + 1])):
            joined = tokens[i] + tokens[i + 1]
            if 3 <= len(joined) <= 20:
                fingerprints.add(joined)
    # Preserve manufacturer-like hyphenated IDs.
    for token in re.findall(r"[a-z]{2,}[a-z0-9]*(?:-[a-z0-9]+)+", raw):
        compact = _compact(token)
        if 7 <= len(compact) <= 24:
            fingerprints.add(compact)
    return fingerprints


def _tier_set(product: Dict[str, Any]) -> Set[str]:
    return set(_tokenize(_title(product))) & MODEL_TIER_WORDS


# ---------------------------------------------------------------------------
# Product family & variant extraction
# ---------------------------------------------------------------------------

_SPEC_VALUE_RE = re.compile(
    r"^\d+(?:\.\d+)?(?:gb|tb|kg|mah|hz|rpm|gib|ml|w|v|inch|inches|l|litre|liter)$"
)

_NETWORK_TOKENS = {"4g", "5g", "wifi", "6g", "lte", "3g"}


def _extract_product_family(
    product: Dict[str, Any], known_brand: Optional[str] = None,
) -> List[str]:
    """Extract ordered family-identity tokens (model line, no variant/tier/spec).

    Strips tier words, variant words (colors), spec values, noise, and audience
    words so that only the core product-line identity remains.

    Examples::

        "Samsung Galaxy S25 5G (Navy, 12GB RAM, 128GB)" -> ["galaxy", "s25"]
        "ASUS TUF A15 Ryzen 7 RTX 3050 16GB 1TB"       -> ["tufa15"]
        "Nike Air Max Excee Running Shoes For Men"       -> ["excee", "running", "shoes"]
        "Sony WH-1000XM5 Wireless Headphones"            -> ["wh1000xm5", "headphones"]
    """
    title = _title(product)
    brand = _brand(product) or _clean_text(known_brand) or ""
    brand_tokens = set(_tokenize(brand))

    tokens = _tokenize(title)
    family: List[str] = []

    exclude = (
        GENERIC_WORDS | AUDIENCE_WORDS | VARIANT_WORDS
        | FEATURE_NOISE | PRESENTATION_WORDS | brand_tokens
        | _NETWORK_TOKENS | SPEC_STARTERS
    )

    for token in tokens:
        if token in exclude:
            continue
        if token in MODEL_TIER_WORDS:
            continue
        if re.fullmatch(r"\d+(?:\.\d+)?", token):
            continue
        if _SPEC_VALUE_RE.fullmatch(token):
            continue
        family.append(token)

    # Merge adjacent tokens where a short alpha prefix is followed by an
    # alphanumeric token, creating compound model identifiers.
    # E.g. ["wh", "1000xm5"] -> ["wh1000xm5"] handles WH-1000XM5 vs WH1000XM5.
    merged: List[str] = []
    i = 0
    while i < len(family):
        if (i + 1 < len(family)
                and re.fullmatch(r"[a-z]{1,4}", family[i])
                and re.search(r"\d", family[i + 1])
                and not _SPEC_VALUE_RE.fullmatch(family[i + 1])):
            merged.append(family[i] + family[i + 1])
            i += 2
        else:
            merged.append(family[i])
            i += 1

    return merged


def _family_fingerprint(
    product: Dict[str, Any], known_brand: Optional[str] = None,
) -> str:
    """Compact, comparable fingerprint of the product family."""
    return "".join(_extract_product_family(product, known_brand))


def _family_similarity(
    product_a: Dict[str, Any],
    product_b: Dict[str, Any],
    known_brand: Optional[str] = None,
) -> Tuple[float, List[str]]:
    """Compare two product families.

    Returns ``(similarity_score, shared_tokens)``.  Uses both set-overlap and
    sequential matching to tolerate platform-specific title differences.
    """
    fa = _extract_product_family(product_a, known_brand)
    fb = _extract_product_family(product_b, known_brand)

    if not fa and not fb:
        return 0.0, []
    if not fa or not fb:
        return 0.0, []

    sa, sb = set(fa), set(fb)
    shared = sorted(sa & sb)

    min_len = min(len(sa), len(sb))
    containment = len(sa & sb) / min_len if min_len else 0.0
    union_len = len(sa | sb)
    jaccard = len(sa & sb) / union_len if union_len else 0.0
    seq_ratio = SequenceMatcher(None, " ".join(fa), " ".join(fb)).ratio()

    score = max(containment * 0.90, jaccard, seq_ratio * 0.85)
    return score, shared


def _extract_variant_spec(product: Dict[str, Any]) -> Dict[str, str]:
    """Extract variant-differentiating specs from a product listing.

    These attributes distinguish variants *within* the same product family:
    color, storage, RAM, capacity, etc.  They influence scoring but do not
    hard-gate matching (two different color variants of the same phone are
    still the same product).
    """
    title = _title(product)
    text = _clean_text(_combined_text(product))
    spec: Dict[str, str] = {}

    # Color from title tokens
    title_tokens = set(_tokenize(title))
    colors = sorted(title_tokens & VARIANT_WORDS)
    if colors:
        spec["color"] = colors[0]

    # Quantity attributes
    qty = _extract_quantity_attributes(text)
    for key in (
        "storage", "ram", "capacity_kg", "capacity_l", "battery",
        "screen_size", "power", "processor", "gpu",
    ):
        if key in qty:
            spec[key] = qty[key]

    # Structured product attributes that the scraper may have set directly
    for src_key, dest_key in (
        ("color", "color"), ("colour", "color"),
        ("size", "size"), ("storage", "storage"), ("ram", "ram"),
    ):
        val = product.get(src_key)
        if val and str(val).strip() and dest_key not in spec:
            spec[dest_key] = _clean_text(val)

    return spec


def _variant_spec_overlap(
    spec_a: Dict[str, str], spec_b: Dict[str, str],
) -> Tuple[float, List[str], List[str]]:
    """Compare two variant specs.

    Returns ``(score, matched_keys, conflict_keys)``.

    * Color mismatches are intentionally excluded from conflict counting
      because the same product is often listed in different default colors.
    * A score of ``1.0`` means every comparable hard-spec matches.
    * A score of ``0.5`` means no specs were comparable (neutral).
    """
    if not spec_a and not spec_b:
        return 1.0, [], []

    # Only hard specs count for overlap scoring.  Color is a soft variant
    # that does not prevent matching.
    hard_keys = (set(spec_a) | set(spec_b)) - {"color"}
    if not hard_keys:
        return 1.0, [], []

    matched: List[str] = []
    conflicts: List[str] = []
    comparable = 0

    for key in sorted(hard_keys):
        va, vb = spec_a.get(key), spec_b.get(key)
        if va and vb:
            comparable += 1
            na = _normalize_attr(key, va)
            nb = _normalize_attr(key, vb)
            if na == nb:
                matched.append(key)
            else:
                conflicts.append(key)

    if comparable == 0:
        return 0.5, matched, conflicts

    return len(matched) / comparable, matched, conflicts


def _identity_overlap(a: Set[str], b: Set[str]) -> Tuple[float, Set[str]]:
    if not a or not b:
        return 0.0, set()
    shared = a & b
    # Containment is useful when one retailer adds many marketing words, but
    # require at least one distinctive token for a strong score.
    containment = len(shared) / min(len(a), len(b))
    jaccard = len(shared) / len(a | b)
    return max(jaccard, containment * 0.90), shared


def _identity_conflict(a: Dict[str, Any], b: Dict[str, Any], brand_match: bool) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    ia = _meaningful_identity_tokens(a)
    ib = _meaningful_identity_tokens(b)

    na, nb = _numeric_model_tokens(a), _numeric_model_tokens(b)
    if na and nb and not (na & nb):
        # Do not reject purely because one title exposes a capacity/size number;
        # only use numbers when they occur in compact model-like tokens.
        ta = {x for x in _tokenize(_title(a)) if re.search(r"[a-z]", x) and re.search(r"\d", x)}
        tb = {x for x in _tokenize(_title(b)) if re.search(r"[a-z]", x) and re.search(r"\d", x)}
        if ta and tb:
            reasons.append("different numeric model identifiers")

    # Strong model-family conflict: Galaxy S25 vs Galaxy A25, A15 vs A14,
    # WH-1000XM5 vs WH-1000XM4. Compact model fingerprints tolerate punctuation
    # differences but still distinguish different model families.
    fp_a = _model_fingerprints(a)
    fp_b = _model_fingerprints(b)
    if fp_a and fp_b and not (fp_a & fp_b) and brand_match:
        # Ignore fingerprints that are only bare presentation specs.
        meaningful_a = {x for x in fp_a if not re.fullmatch(r"\d+(?:gb|tb|kg|mah|hz|rpm|gib|ml|w|v)", x)}
        meaningful_b = {x for x in fp_b if not re.fullmatch(r"\d+(?:gb|tb|kg|mah|hz|rpm|gib|ml|w|v)", x)}
        if meaningful_a and meaningful_b:
            reasons.append("different model families")

    # Strong model-tier conflicts: S25 vs S25 Ultra, iPhone 17 vs iPhone 17 Pro,
    # DualSense vs DualSense Edge. These are identity differences, not variants.
    ta, tb = _tier_set(a), _tier_set(b)
    shared_base = ia & ib
    if shared_base:
        if ta != tb and (ta or tb):
            # Ignore generic 'plus' when it is clearly presentation text only;
            # strong tiers are identity-bearing.
            strong_tiers = MODEL_TIER_WORDS - {"core", "go", "air"}
            if (ta & strong_tiers) != (tb & strong_tiers):
                reasons.append("different model tier")

    # If both sides contain several distinctive identity words but share almost
    # none, don't let character similarity rescue them.
    if len(ia) >= 2 and len(ib) >= 2:
        overlap, _ = _identity_overlap(ia, ib)
        if overlap < 0.25 and brand_match:
            reasons.append("low overlap in named product identity")

    return bool(reasons), reasons


# ---------------------------------------------------------------------------
# Similarity features
# ---------------------------------------------------------------------------

def _matching_text(product: Dict[str, Any]) -> str:
    brand = _brand(product)
    title = _title(product)
    # Description is deliberately omitted from the main similarity text: it is
    # often boilerplate and can cause unrelated products to look similar.
    tokens = _tokenize(f"{brand} {title}")
    return " ".join(t for t in tokens if t not in GENERIC_WORDS)


def _tfidf_similarity(a: Dict[str, Any], b: Dict[str, Any]) -> Tuple[float, float]:
    texts = [_matching_text(a), _matching_text(b)]
    if not all(texts):
        return 0.0, 0.0
    try:
        word_vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
        mat = word_vec.fit_transform(texts)
        word = float(cosine_similarity(mat[0:1], mat[1:2])[0][0])
    except ValueError:
        word = 0.0
    try:
        char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        mat = char_vec.fit_transform(texts)
        char = float(cosine_similarity(mat[0:1], mat[1:2])[0][0])
    except ValueError:
        char = 0.0
    return word, char


def _title_similarity(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    ta, tb = _title(a), _title(b)
    return SequenceMatcher(None, ta, tb).ratio() if ta and tb else 0.0


def _weighted_identity_similarity(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0

    def w(t: str) -> float:
        if re.search(r"\d", t):
            return 2.5
        if len(t) >= 8:
            return 1.8
        return 1.0

    shared = a & b
    denom = sum(w(x) for x in a) + sum(w(x) for x in b)
    return 2 * sum(w(x) for x in shared) / denom if denom else 0.0


def _attribute_similarity(a: Dict[str, str], b: Dict[str, str]) -> Tuple[float, List[str], List[str]]:
    comparable = 0
    matched = 0
    matched_keys: List[str] = []
    conflicts: List[str] = []

    # These are variant attributes. A mismatch is evidence that two listings are
    # different variants, but not necessarily a different underlying family.
    for key in set(a) | set(b):
        va, vb = a.get(key), b.get(key)
        if not va or not vb:
            continue
        comparable += 1
        na, nb = _normalize_attr(key, va), _normalize_attr(key, vb)
        if na == nb:
            matched += 1
            matched_keys.append(key)
        else:
            conflicts.append(key)

    score = matched / comparable if comparable else 0.0
    return score, matched_keys, conflicts


def _normalize_attr(key: str, value: str) -> str:
    value = _clean_text(value)
    if key == "storage":
        m = re.search(r"(\d+(?:\.\d+)?)\s*(tb|gb)", value)
        if m:
            n = float(m.group(1)) * (1024 if m.group(2) == "tb" else 1)
            return str(int(n)) + "gb"
    if key in {"ram", "capacity_kg", "capacity_l", "battery", "power", "rpm", "screen_size", "refresh_rate", "shoe_size"}:
        return re.sub(r"\s+", "", value)
    return re.sub(r"\s+", " ", value).strip()


# ---------------------------------------------------------------------------
# Pair scoring
# ---------------------------------------------------------------------------

def calculate_pair_match(
    product_a: Dict[str, Any],
    product_b: Dict[str, Any],
    known_brands: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    known_brands = set(known_brands or set())
    ba, bb = _brand(product_a), _brand(product_b)
    if ba:
        known_brands.add(ba)
    if bb:
        known_brands.add(bb)

    brand_match, brand_inferred, common_brand = _brand_relation(product_a, product_b, known_brands)
    category_a, category_b = detect_category(product_a), detect_category(product_b)
    role_a, role_b = _detect_role(product_a), _detect_role(product_b)

    attrs_a = _extract_generic_attributes(product_a)
    attrs_b = _extract_generic_attributes(product_b)

    id_a = _meaningful_identity_tokens(product_a, common_brand)
    id_b = _meaningful_identity_tokens(product_b, common_brand)
    identity_sim = _weighted_identity_similarity(id_a, id_b)
    overlap, shared_identity = _identity_overlap(id_a, id_b)

    word_sim, char_sim = _tfidf_similarity(product_a, product_b)
    title_sim = _title_similarity(product_a, product_b)
    attr_sim, matched_attrs, conflicts = _attribute_similarity(attrs_a, attrs_b)

    # Variant-aware family and spec extraction
    family_sim, family_shared = _family_similarity(product_a, product_b, common_brand)
    variant_a = _extract_variant_spec(product_a)
    variant_b = _extract_variant_spec(product_b)
    variant_overlap_score, variant_matched, variant_conflicts = _variant_spec_overlap(variant_a, variant_b)
    family_fp_a = _family_fingerprint(product_a, common_brand)
    family_fp_b = _family_fingerprint(product_b, common_brand)

    identifier_a = _identifier(product_a, attrs_a)
    identifier_b = _identifier(product_b, attrs_b)
    identifier_match = bool(identifier_a and identifier_b and identifier_a == identifier_b)

    model_a = attrs_a.get("structured_model") or attrs_a.get("title_model")
    model_b = attrs_b.get("structured_model") or attrs_b.get("title_model")
    exact_model = bool(model_a and model_b and _compact(model_a) == _compact(model_b))
    model_fp_a = _model_fingerprints(product_a)
    model_fp_b = _model_fingerprints(product_b)
    shared_model_fingerprints = model_fp_a & model_fp_b

    category_match = category_a == category_b
    category_compatible = category_match or category_a == "general" or category_b == "general"

    identity_conflict, conflict_reasons = _identity_conflict(product_a, product_b, brand_match)

    reasons: List[str] = []
    hard_reject = False

    # 1) Role is a hard gate. Main product vs accessory is never a match.
    if {role_a, role_b} == {"main", "accessory"}:
        hard_reject = True
        reasons.append("main product vs accessory/part")
    elif role_a == "accessory" and role_b == "accessory":
        # Accessories must share a parent category to be considered.
        if category_a != category_b:
            hard_reject = True
            reasons.append("different accessory categories")

    # 2) Category gate. This prevents washing machine / refrigerator / phone etc.
    # from matching solely on generic words.
    if not category_compatible and role_a != "unknown" and role_b != "unknown":
        hard_reject = True
        reasons.append(f"different categories: {category_a} vs {category_b}")

    # 3) Explicit brands, when both known, are strong identity evidence.
    if ba and bb and ba != bb:
        hard_reject = True
        reasons.append("different brands")

    # 4) Global identifiers are decisive when both exist.
    identifier_conflict = bool(identifier_a and identifier_b and identifier_a != identifier_b)
    if identifier_match:
        score = 99.0
    else:
        # Variant-aware scoring: family similarity and variant spec overlap
        # are first-class signals alongside identity and text similarity.
        nlp = (
            0.25 * word_sim
            + 0.12 * char_sim
            + 0.08 * title_sim
            + 0.35 * identity_sim
            + 0.20 * family_sim
        )

        score = (
            44 * nlp
            + 15 * (1.0 if brand_match else 0.0)
            + 12 * (1.0 if exact_model else 0.0)
            + 10 * (1.0 if shared_model_fingerprints else 0.0)
            + 8 * overlap
            + 6 * variant_overlap_score
            + 5 * (1.0 if category_match else 0.0)
        )

        # Strong product-family anchors. These are deliberately conditional,
        # preventing generic "washing machine" matches from receiving a rescue.
        if brand_match and identity_sim >= 0.72:
            score = max(score, 72.0)
        if brand_match and overlap >= 0.80 and identity_sim >= 0.60:
            score = max(score, 76.0)
        if exact_model and brand_match:
            score = max(score, 84.0)
        if shared_model_fingerprints and brand_match:
            score = max(score, 72.0)
        # Variant-aware family rescues
        if brand_match and family_sim >= 0.80:
            score = max(score, 72.0)
        if brand_match and family_sim >= 0.80 and variant_overlap_score >= 0.70:
            score = max(score, 78.0)

    # Identity conflicts are hard rejects, except an exact global identifier.
    if identity_conflict and not identifier_match:
        hard_reject = True
        reasons.extend(conflict_reasons)

    # Family-level conflict: products from the same brand but clearly
    # different product families (e.g. Galaxy Tab vs Galaxy S).
    if (brand_match and family_fp_a and family_fp_b
            and not identifier_match and not hard_reject):
        if family_sim < 0.25 and len(family_fp_a) >= 3 and len(family_fp_b) >= 3:
            hard_reject = True
            reasons.append("different product families")

    # A pair with no meaningful identity evidence should not pass merely because
    # both titles say the same generic category.
    meaningful_evidence = (
        identifier_match
        or exact_model
        or bool(shared_model_fingerprints and brand_match)
        or (brand_match and identity_sim >= 0.45)
        or (identity_sim >= 0.62 and category_match)
        or (brand_match and family_sim >= 0.65)
    )
    if not meaningful_evidence and not identifier_match:
        hard_reject = True
        reasons.append("insufficient distinctive product identity")

    # Category mismatch receives no soft rescue.
    if not category_compatible:
        hard_reject = True

    score = round(max(0.0, min(100.0, score)), 2)

    is_match = False
    if identifier_match:
        is_match = True
        reasons.insert(0, "exact global product identifier")
    elif not hard_reject:
        # Production threshold is compatible with the existing API's min_score=62,
        # but we also require identity evidence so threshold alone cannot create a match.
        is_match = score >= 62 and meaningful_evidence

    if is_match:
        reasons.insert(0, "strong shared product identity")
        if brand_match:
            reasons.append("brand matches" + (" (inferred)" if brand_inferred else ""))
        if category_match:
            reasons.append(f"same category: {category_a}")
        if exact_model:
            reasons.append("model identifier matches")
        elif shared_identity:
            reasons.append("shared identity: " + ", ".join(sorted(shared_identity)))
        if shared_model_fingerprints:
            reasons.append("shared model fingerprint: " + ", ".join(sorted(shared_model_fingerprints)))
        if family_shared:
            reasons.append("shared family: " + ", ".join(family_shared))
        if variant_matched:
            reasons.append("matching variant specs: " + ", ".join(sorted(variant_matched)))
        if matched_attrs:
            reasons.append("matching attributes: " + ", ".join(sorted(set(matched_attrs))))
    elif not reasons:
        reasons.append("insufficient product identity similarity")

    confidence = "high" if score >= 85 else "medium" if score >= 72 else "low"

    return {
        "is_match": bool(is_match),
        "score": score,
        "confidence": confidence,
        "reason": "; ".join(dict.fromkeys(reasons)),
        "nlp_score": round((0.25 * word_sim + 0.12 * char_sim + 0.08 * title_sim + 0.35 * identity_sim + 0.20 * family_sim) * 100, 2),
        "word_similarity": round(word_sim * 100, 2),
        "char_similarity": round(char_sim * 100, 2),
        "title_similarity": round(title_sim * 100, 2),
        "identity_similarity": round(identity_sim * 100, 2),
        "identity_overlap": round(overlap * 100, 2),
        "attribute_similarity": round(attr_sim * 100, 2),
        "brand_match": brand_match,
        "brand_inferred": brand_inferred,
        "exact_model_match": exact_model,
        "shared_model_fingerprints": sorted(shared_model_fingerprints),
        "identifier_match": identifier_match,
        "category_match": category_match,
        "category_a": category_a,
        "category_b": category_b,
        "role_a": role_a,
        "role_b": role_b,
        "identity_conflict": identity_conflict,
        "identity_conflict_reasons": conflict_reasons,
        "matched_attributes": sorted(set(matched_attrs)),
        "conflicts": sorted(set(conflicts)),
        "attributes_a": attrs_a,
        "attributes_b": attrs_b,
        "family_similarity": round(family_sim * 100, 2),
        "family_shared": family_shared,
        "family_fingerprint_a": family_fp_a,
        "family_fingerprint_b": family_fp_b,
        "variant_spec_a": variant_a,
        "variant_spec_b": variant_b,
        "variant_overlap": round(variant_overlap_score * 100, 2),
        "variant_matched": variant_matched,
        "variant_conflicts": variant_conflicts,
    }


# ---------------------------------------------------------------------------
# Matching / assignment
# ---------------------------------------------------------------------------

def _dedupe_products(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[Tuple[str, str, str]] = set()
    output: List[Dict[str, Any]] = []
    for product in products or []:
        brand = _brand(product)
        title = _title(product)
        url = _clean_text(product.get("url") or product.get("product_url"))
        key = (_compact(brand), _compact(title), url if url else "")
        # If URL is absent, title+brand dedupes repeated scraper records.
        if not url:
            key = (_compact(brand), _compact(title), "")
        if key in seen:
            continue
        seen.add(key)
        output.append(product)
    return output


def match_products(
    source_products: List[Dict[str, Any]],
    target_products: List[Dict[str, Any]],
    min_score: float = 62,
) -> List[Dict[str, Any]]:
    source = _dedupe_products(source_products or [])
    target = _dedupe_products(target_products or [])

    known_brands = {
        _brand(p) for p in source + target if _brand(p)
    }

    candidates: List[Dict[str, Any]] = []
    for i, a in enumerate(source):
        for j, b in enumerate(target):
            result = calculate_pair_match(a, b, known_brands=known_brands)
            if result["is_match"] and result["score"] >= min_score:
                candidates.append({
                    "source_index": i,
                    "target_index": j,
                    "source": a,
                    "target": b,
                    **result,
                })

    # Best pair first. Add a strong preference for non-conflicting variants so that
    # S25 256GB matches S25 256GB rather than stealing a 128GB or 512GB listing.
    def _has_hard_variant_conflict(c: Dict[str, Any]) -> bool:
        return any(
            k in {"storage", "ram", "screen_size", "capacity_kg"}
            for k in c.get("variant_conflicts", [])
        )

    candidates.sort(
        key=lambda x: (
            x["identifier_match"],
            x["exact_model_match"],
            not _has_hard_variant_conflict(x),
            x.get("variant_overlap", 0),
            x["score"],
        ),
        reverse=True,
    )

    used_source: Set[int] = set()
    used_target: Set[int] = set()
    matches: List[Dict[str, Any]] = []

    for candidate in candidates:
        si, ti = candidate["source_index"], candidate["target_index"]
        if si in used_source or ti in used_target:
            continue
        used_source.add(si)
        used_target.add(ti)
        matches.append(candidate)

    matches.sort(key=lambda x: (-x["score"], x["source_index"], x["target_index"]))
    return matches


def match_all(
    amazon_products: List[Dict[str, Any]],
    flipkart_products: List[Dict[str, Any]],
    min_score: float = 62,
) -> Dict[str, Any]:
    first = _dedupe_products(amazon_products or [])
    second = _dedupe_products(flipkart_products or [])
    matches = match_products(first, second, min_score=min_score)
    matched_first = {m["source_index"] for m in matches}
    matched_second = {m["target_index"] for m in matches}
    return {
        "matches": matches,
        "match_count": len(matches),
        "first_platform_count": len(first),
        "second_platform_count": len(second),
        "unmatched_first_platform": len(first) - len(matched_first),
        "unmatched_second_platform": len(second) - len(matched_second),
    }


def explain_matches(matches: List[Dict[str, Any]]) -> None:
    print("\n" + "=" * 88)
    print("SMARTBUY PRODUCTION NLP PRODUCT MATCHER")
    print("=" * 88)
    print(f"Accepted matches: {len(matches)}")
    for n, m in enumerate(matches, 1):
        a, b = m["source"], m["target"]
        print(f"\n[{n}] {m['score']}/100 ({m['confidence']})")
        print("A:", a.get("title") or a.get("name"))
        print("B:", b.get("title") or b.get("name"))
        print("Category:", m["category_a"], "vs", m["category_b"])
        print("Role:", m["role_a"], "vs", m["role_b"])
        print("Reason:", m["reason"])
        print(
            "Brand={} | Model={} | Family={:.1f}% | Variant={:.1f}% | Identity={:.1f}% | Word={:.1f}%".format(
                m["brand_match"], m["exact_model_match"], m.get("family_similarity", 0),
                m.get("variant_overlap", 0), m["identity_similarity"], m["word_similarity"],
            )
        )
        if m.get("variant_spec_a") or m.get("variant_spec_b"):
            print(f"  Variant A: {m.get('variant_spec_a', {})}")
            print(f"  Variant B: {m.get('variant_spec_b', {})}")
    print("=" * 88)


# ---------------------------------------------------------------------------
# Production test suite
# ---------------------------------------------------------------------------

def _pair(title_a: str, title_b: str, brand_a: Optional[str] = None, brand_b: Optional[str] = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    return (
        {"title": title_a, "brand": brand_a},
        {"title": title_b, "brand": brand_b},
    )


def _production_tests() -> List[Tuple[str, Dict[str, Any], Dict[str, Any], bool]]:
    tests: List[Tuple[str, Dict[str, Any], Dict[str, Any], bool]] = []

    def add(name: str, a: Dict[str, Any], b: Dict[str, Any], expected: bool):
        tests.append((name, a, b, expected))

    # Phones
    add("S25 exact variant", *_pair(
        "Galaxy S25 5G (Navy, 12GB RAM, 128GB Storage)",
        "Samsung Galaxy S25 5G (Icyblue, 256 GB)", "Samsung", "Samsung"), True)
    add("S25 color wording", *_pair(
        "Samsung Galaxy S25 5G 256GB Silver Shadow",
        "Samsung Galaxy S25 5G 256 GB Silver", "Samsung", "Samsung"), True)
    add("S25 vs S25 Ultra", *_pair(
        "Samsung Galaxy S25 5G 256GB", "Samsung Galaxy S25 Ultra 256GB", "Samsung", "Samsung"), False)
    add("S25 vs S24", *_pair(
        "Samsung Galaxy S25 5G 256GB", "Samsung Galaxy S24 5G 256GB", "Samsung", "Samsung"), False)
    add("S25 vs S25 FE", *_pair(
        "Samsung Galaxy S25 5G 256GB", "Samsung Galaxy S25 FE 5G 128GB", "Samsung", "Samsung"), False)
    add("S25 vs A25", *_pair(
        "Samsung Galaxy S25 5G 256GB", "Samsung Galaxy A25 5G 256GB", "Samsung", "Samsung"), False)
    add("S25 vs S25 Plus", *_pair(
        "Samsung Galaxy S25 5G 256GB", "Samsung Galaxy S25 Plus 5G 256GB", "Samsung", "Samsung"), False)
    add("iPhone 17 variants", *_pair(
        "Apple iPhone 17 256 GB", "Apple iPhone 17 256 GB", "Apple", "Apple"), True)
    add("iPhone 17 Pro conflict", *_pair(
        "Apple iPhone 17 Pro 256 GB", "Apple iPhone 17 256 GB", "Apple", "Apple"), False)

    # Washing machines / appliances
    add("Whirlpool washing machine 6 vs 7 kg", *_pair(
        "Whirlpool 6 kg Magic Clean 5 Star Fully Automatic Top Load Washing Machine",
        "Whirlpool 7 kg Magic Clean 5 Star Fully Automatic Top Load Washing Machine", "Whirlpool", "Whirlpool"), True)
    add("Whirlpool washing machine different color", *_pair(
        "Whirlpool 7 kg Magic Clean Fully Automatic Top Load Washing Machine Black",
        "Whirlpool 7 kg Magic Clean Fully Automatic Top Load Washing Machine Grey", "Whirlpool", "Whirlpool"), True)
    add("Washing machine vs trolley", *_pair(
        "Whirlpool 7 kg Magic Clean Fully Automatic Top Load Washing Machine",
        "Washing Machine Trolley Stand Adjustable Heavy Duty", "Whirlpool", None), False)
    add("Washing machine vs capacitor", *_pair(
        "Whirlpool 7 kg Magic Clean Fully Automatic Top Load Washing Machine",
        "Washing Machine Capacitor 14UF Replacement Part", "Whirlpool", None), False)
    add("Washing machine vs cover", *_pair(
        "Whirlpool 7 kg Magic Clean Fully Automatic Top Load Washing Machine",
        "Whirlpool Washing Machine Waterproof Cover", "Whirlpool", "Whirlpool"), False)
    add("Washing machine vs refrigerator", *_pair(
        "Whirlpool 7 kg Magic Clean Washing Machine",
        "Whirlpool 265 L Frost Free Refrigerator", "Whirlpool", "Whirlpool"), False)

    # Gaming
    add("DualSense exact", *_pair(
        "Sony DualSense Wireless Controller White PS5",
        "Sony PS5 DualSense Wireless Controller", "Sony", "Sony"), True)
    add("DualSense vs Edge", *_pair(
        "Sony DualSense Wireless Controller",
        "Sony DualSense Edge Wireless Controller", "Sony", "Sony"), False)
    add("DualSense vs charging station", *_pair(
        "Sony DualSense Wireless Controller",
        "Sony DualSense Charging Station", "Sony", "Sony"), False)

    # Laptops
    add("TUF A15 same family", *_pair(
        "ASUS TUF A15 Ryzen 7 7445HS RTX 3050 16GB 1TB",
        "ASUS TUF A15 Gaming Laptop Ryzen 7 7445HS RTX3050 16 GB 1TB SSD", "ASUS", "ASUS"), True)
    add("TUF A15 different GPU/config", *_pair(
        "ASUS TUF A15 Ryzen 7 7445HS RTX 3050 16GB 1TB",
        "ASUS TUF A15 Ryzen 7 7435HS RTX 2050 8GB 512GB", "ASUS", "ASUS"), True)
    add("TUF vs Vivobook", *_pair(
        "ASUS TUF A15 Ryzen 7 7445HS RTX 3050",
        "ASUS Vivobook 15 Core i5 16GB 1TB", "ASUS", "ASUS"), False)

    # Footwear
    add("Nike same shoe", *_pair(
        "Nike Air Max Excee Running Shoes For Men",
        "NIKE AIR MAX EXCEE Sneakers for Men", "Nike", "NIKE"), True)
    add("Nike different shoe", *_pair(
        "Nike Air Max Excee Running Shoes",
        "Nike Air Max Alpha Trainer Shoes", "Nike", "Nike"), False)

    # Books
    add("Book same ISBN", {"title": "Atomic Habits", "brand": None, "isbn": "9780735211292"},
        {"title": "Atomic Habits by James Clear", "brand": None, "isbn": "9780735211292"}, True)

    # Other categories
    add("Sony headphones", *_pair(
        "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
        "Sony WH1000XM5 Wireless Headphones with Noise Cancellation", "Sony", "Sony"), True)
    add("Headphones vs case", *_pair(
        "Sony WH-1000XM5 Wireless Headphones",
        "Protective Case for Sony WH-1000XM5 Headphones", "Sony", "Sony"), False)
    add("TV same family", *_pair(
        "Samsung 55 inch Crystal 4K Smart TV",
        "Samsung 55-Inch Crystal UHD 4K Smart Television", "Samsung", "Samsung"), True)
    add("TV vs wall mount", *_pair(
        "Samsung 55 inch Crystal 4K Smart TV",
        "Universal Wall Mount Stand for 55 Inch TV", "Samsung", None), False)
    add("Refrigerator same family", *_pair(
        "LG 260 L Frost Free Double Door Refrigerator",
        "LG 260 Litres Frost Free Double Door Fridge", "LG", "LG"), True)

    # Cross product-line same brand (variant-aware family rejection)
    add("Samsung Galaxy vs Galaxy Tab", *_pair(
        "Samsung Galaxy S25 5G 256GB",
        "Samsung Galaxy Tab S9 256GB WiFi", "Samsung", "Samsung"), False)
    add("Sony WH vs WF headphones vs earbuds", *_pair(
        "Sony WH-1000XM5 Wireless Headphones",
        "Sony WF-1000XM5 Wireless Earbuds", "Sony", "Sony"), False)
    add("iPhone 17 vs iPhone 16", *_pair(
        "Apple iPhone 17 256 GB",
        "Apple iPhone 16 256 GB", "Apple", "Apple"), False)

    # Same variant exact spec match (variant-aware matching)
    add("S25 exact storage match", *_pair(
        "Samsung Galaxy S25 5G 256GB Black",
        "Samsung Galaxy S25 5G 256 GB Blue", "Samsung", "Samsung"), True)
    add("MacBook Air M3 variant", *_pair(
        "Apple MacBook Air M3 13 inch 8GB 256GB",
        "Apple MacBook Air 13-inch M3 Chip 8 GB 256 GB", "Apple", "Apple"), True)

    return tests


def run_production_tests() -> Dict[str, int]:
    tests = _production_tests()
    passed = 0
    failed = 0
    print("\n" + "=" * 88)
    print("SMARTBUY PRODUCTION MATCHER TEST SUITE")
    print("=" * 88)
    print("Cases:", len(tests))

    for i, (name, a, b, expected) in enumerate(tests, 1):
        result = calculate_pair_match(a, b)
        ok = result["is_match"] == expected
        if ok:
            passed += 1
            status = "PASS"
        else:
            failed += 1
            status = "FAIL"
        print(f"{status:4} {i:02d} | {name:34} | expected={expected:<5} actual={result['is_match']:<5} score={result['score']:>6}")
        if not ok:
            print("      A:", a.get("title"))
            print("      B:", b.get("title"))
            print("      reason:", result["reason"])
            print("      category:", result["category_a"], "vs", result["category_b"], "role:", result["role_a"], "vs", result["role_b"])

    print("-" * 88)
    print(f"PASSED: {passed}/{len(tests)}")
    print(f"FAILED: {failed}/{len(tests)}")
    print("=" * 88)
    return {"total": len(tests), "passed": passed, "failed": failed}


if __name__ == "__main__":
    run_production_tests()

import re

def normalize_product_name(name: str) -> str:
    """
    Basic product normalization.
    Converts casing, removes punctuation and common noise words,
    and collapses whitespace.
    """
    text = (name or "").lower()

    text = re.sub(r"[^a-z0-9\s]", " ", text)

    noise = {
        "buy", "online", "best", "price", "offer", "offers",
        "with", "free", "new", "latest"
    }

    words = [word for word in text.split() if word not in noise]

    return " ".join(words)

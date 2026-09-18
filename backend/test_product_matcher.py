"""
SmartBuy - Real Scraper -> NLP Matcher Test

IMPORTANT:
- This is a TEST FILE only.
- It does NOT modify scraper.py.
- It calls the existing services.scraper.search_platform() functions.
- It sends their returned Amazon/Flipkart product lists into the separate
  services.product_matcher module.

Run from:
    D:\PROJECTS\SmartBuy\backend

Command:
    python test_product_matcher.py

You can change TEST_QUERY below.
"""

from services.scraper import search_platform
from services.product_matcher import match_all, explain_matches


TEST_QUERY = "Sony DualSense Wireless Controller"


def main():
    print("\n" + "=" * 80)
    print("SMARTBUY REAL SCRAPER -> NLP MATCHER TEST")
    print("=" * 80)
    print("Query:", TEST_QUERY)
    print("=" * 80)

    # IMPORTANT:
    # These are the existing scraper functions.
    # No code inside scraper.py is changed.
    print("\n[1/3] Getting Amazon products...")
    amazon_products = search_platform(
        TEST_QUERY,
        "Amazon",
        pages=1,
    )

    print(f"[TEST] Amazon products received: {len(amazon_products)}")

    print("\n[2/3] Getting Flipkart products...")
    flipkart_products = search_platform(
        TEST_QUERY,
        "Flipkart",
        pages=1,
    )

    print(f"[TEST] Flipkart products received: {len(flipkart_products)}")

    # Show a compact input diagnostic before matching.
    print("\n" + "=" * 80)
    print("PRODUCT DATA RECEIVED BY MATCHER")
    print("=" * 80)

    print("\nAMAZON:")
    for i, product in enumerate(amazon_products, 1):
        print(
            f"{i}. "
            f"{product.get('title') or product.get('name')} | "
            f"brand={product.get('brand')} | "
            f"model={product.get('model_number')} | "
            f"price={product.get('price')}"
        )

    print("\nFLIPKART:")
    for i, product in enumerate(flipkart_products, 1):
        print(
            f"{i}. "
            f"{product.get('title') or product.get('name')} | "
            f"brand={product.get('brand')} | "
            f"model={product.get('model_number')} | "
            f"price={product.get('price')}"
        )

    # Separate matcher starts here.
    print("\n" + "=" * 80)
    print("[3/3] Running separate generic NLP matcher...")
    print("=" * 80)

    result = match_all(
        amazon_products,
        flipkart_products,
    )

    explain_matches(result["matches"])

    print("\n" + "=" * 80)
    print("FINAL TEST SUMMARY")
    print("=" * 80)
    print("Amazon products:", result["first_platform_count"])
    print("Flipkart products:", result["second_platform_count"])
    print("Matched products:", result["match_count"])
    print("Unmatched Amazon:", result["unmatched_first_platform"])
    print("Unmatched Flipkart:", result["unmatched_second_platform"])
    print("=" * 80)


if __name__ == "__main__":
    main()
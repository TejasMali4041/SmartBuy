import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./SearchResults.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

const CACHE_PREFIX = "smartbuy_search_";
const CACHE_VERSION = "v1";

function getCacheKey(query) {
  return `${CACHE_PREFIX}${CACHE_VERSION}_${query.trim().toLowerCase()}`;
}

function readCachedSearch(query) {
  try {
    const raw = sessionStorage.getItem(getCacheKey(query));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    return cached?.data || null;
  } catch (error) {
    console.warn("[SmartBuy Frontend] Cache read failed:", error);
    return null;
  }
}

function saveCachedSearch(query, data) {
  try {
    sessionStorage.setItem(
      getCacheKey(query),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      })
    );
  } catch (error) {
    console.warn("[SmartBuy Frontend] Cache save failed:", error);
  }
}

/* Keep search cards simple. Detailed marketplace information belongs
   on the Product Details page. */
function cleanTitle(title = "") {
  return String(title)
    .replace(/[|•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_WORDS = new Set([
  "the", "and", "with", "for", "from", "new", "latest", "best",
  "original", "official", "product", "products", "model", "item",
  "online", "buy", "sale", "offer", "offers", "free", "delivery",
  "available", "india", "in", "on", "at", "by", "of", "to",
  "smartphone", "mobile", "phone", "laptop", "tablet", "computer",
  "washing", "machine", "refrigerator", "fridge", "television", "tv",
  "headphones", "headphone", "earbuds", "earphone", "earphones",
  "watch", "smartwatch", "camera", "speaker", "mixer", "grinder",
  "microwave", "oven", "air", "conditioner", "ac", "cooler",
  "vacuum", "cleaner", "printer", "monitor", "keyboard", "mouse",
  "chair", "shirt", "t-shirt", "jeans", "shoes", "shoe", "book",
  "backpack", "bag", "fully", "automatic", "top", "load", "front",
  "star", "rated", "digital", "display", "wireless", "bluetooth"
]);

function isMarketplaceIdentifier(value) {
  const token = String(value || "").trim();

  // Amazon ASIN: exactly 10 alphanumeric characters, commonly B0...
  if (/^B0[A-Z0-9]{8}$/i.test(token)) return true;

  // Other marketplace/catalog identifiers. Do not expose long opaque
  // alphanumeric IDs in the common product name.
  if (
    /^[A-Z0-9]{10,}$/i.test(token) &&
    /\d/.test(token) &&
    /[A-Z]/i.test(token)
  ) {
    return true;
  }

  return false;
}

const VARIANT_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|lbs|litre|liter|liters|litres|ml)\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:inch|inches|")\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:gb|tb|mb)\b/gi,
  /\b\d+\s*gb\s*ram\b/gi,
  /\b\d+\s*(?:mp|mah|w|hz|rpm|pa|bar)\b/gi,
  /\b(?:4g|5g|wifi|wi-fi|wi fi|bluetooth)\b/gi,
  /\b(?:top load|front load|semi automatic|fully automatic|inverter|direct drive|belt drive)\b/gi,
  /\b(?:[a-z]+\s+)?(?:series|edition|generation|gen)\s*\d+\b/gi,
  /\b(?:pro|plus|ultra|max|mini|fe|edge|neo|lite|air)\b/gi,
  /\b(?:black|white|blue|red|green|silver|grey|gray|gold|purple|pink|navy|beige|brown)\b/gi
];

function unique(values) {
  return [...new Set(values.filter(Boolean).map((v) => v.trim()).filter(Boolean))];
}

function normaliseToken(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "")
    .trim();
}

function titleTokens(title) {
  return cleanTitle(title)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter(Boolean);
}

function getBrand(amazon, flipkart) {
  return (
    amazon?.brand ||
    flipkart?.brand ||
    extractBrandFromTitle(amazon?.title, flipkart?.title)
  );
}

function extractBrandFromTitle(aTitle = "", fTitle = "") {
  const common = getCommonMeaningfulTokens(aTitle, fTitle);
  return common[0] || "";
}

function getCommonMeaningfulTokens(aTitle, fTitle) {
  const a = titleTokens(aTitle);
  const f = titleTokens(fTitle);
  const fSet = new Set(f.map(normaliseToken));

  return a.filter((token) => {
    const n = normaliseToken(token);
    return (
      n &&
      fSet.has(n) &&
      !GENERIC_WORDS.has(n) &&
      !/^\d+(?:\.\d+)?$/.test(n)
    );
  });
}

function getProductName(amazon, flipkart) {
  const aTitle = cleanTitle(amazon?.title);
  const fTitle = cleanTitle(flipkart?.title);

  const brand = getBrand(amazon, flipkart);
  const common = unique(getCommonMeaningfulTokens(aTitle, fTitle));

  // Prefer the strongest product identity fields supplied by the scraper.
  const rawModel =
    amazon?.model_number ||
    flipkart?.model_number ||
    amazon?.model ||
    flipkart?.model ||
    "";

  const modelText = isMarketplaceIdentifier(rawModel)
    ? ""
    : String(rawModel).trim();

  // Build a concise identity from shared meaningful title tokens.
  const identityTokens = [];
  if (brand) identityTokens.push(brand);

  if (modelText && !identityTokens.join(" ").toLowerCase().includes(modelText.toLowerCase())) {
    identityTokens.push(modelText);
  }

  for (const token of common) {
    if (identityTokens.length >= 5) break;

    const normalized = normaliseToken(token);

    // Never put variant/specification values into the common product name.
    // Product name should represent identity, not capacity, rating, size,
    // storage, colour, connectivity, etc.
    const isVariantToken =
      isMarketplaceIdentifier(token) ||
      !normalized ||
      /^\d+(?:\.\d+)?$/.test(normalized) ||
      /^\d+(?:\.\d+)?(?:kg|g|mg|lb|lbs|l|ml|gb|tb|mb|inch|in|hz|mah|mp|w|rpm)$/.test(normalized) ||
      /^(?:5|4)star$/.test(normalized) ||
      /^(?:4g|5g|wifi|wi-fi|bluetooth)$/.test(normalized) ||
      /^(?:black|white|blue|red|green|silver|grey|gray|gold|purple|pink|navy|beige|brown)$/.test(normalized) ||
      /^(?:pro|plus|ultra|max|mini|fe|edge|neo|lite|air)$/.test(normalized);

    if (isVariantToken) continue;

    const duplicate = identityTokens.some(
      (x) => normaliseToken(x) === normalized
    );

    if (!duplicate) identityTokens.push(token);
  }

  if (identityTokens.length >= 2) {
    return identityTokens
      .slice(0, 5)
      .filter((token) => !isMarketplaceIdentifier(token))
      .join(" ")
      .trim();
  }

  // If the common identity is weak, use a compact cleaned title instead
  // of returning only a generic category such as "Washing Machine".
  const fallback = aTitle.length <= fTitle.length ? aTitle : fTitle;
  const cleanedFallback = fallback
    .replace(/\([^)]*\)/g, "")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, "")
    .replace(/\b[A-Z0-9]{10,}\b/g, (token) =>
      isMarketplaceIdentifier(token) ? "" : token
    )
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|lbs|l|ml|gb|tb|mb|inch|inches|in|hz|mah|mp|w|rpm)\b/gi, "")
    .replace(/\b(?:4|5)\s*star\b/gi, "")
    .replace(/\b(?:4g|5g|wifi|wi-fi|bluetooth)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleanedFallback
    .split(/\s+/)
    .filter((token) => !isMarketplaceIdentifier(token))
    .join(" ")
    .trim()
    .slice(0, 90);
}

function extractVariants(amazon, flipkart) {
  const texts = [amazon?.title, flipkart?.title]
    .filter(Boolean)
    .map(cleanTitle);

  const found = [];

  for (const text of texts) {
    for (const pattern of VARIANT_PATTERNS) {
      const matches = text.match(pattern) || [];
      found.push(...matches);
    }
  }

  // Keep meaningful variants, normalize casing/spacing, and avoid duplicates.
  return unique(
    found
      .map((value) =>
        value
          .replace(/\s+/g, " ")
          .replace(/wi fi/i, "Wi-Fi")
          .replace(/wifi/i, "Wi-Fi")
          .trim()
      )
      .filter((value) => value.length > 1)
  ).slice(0, 6);
}

function getProductDescription(amazon, flipkart) {
  const text = [amazon?.title, flipkart?.title]
    .filter(Boolean)
    .map(cleanTitle)
    .join(" ");

  const words = [];
  const add = (value) => {
    if (value && !words.includes(value)) words.push(value);
  };

  if (/top load/i.test(text)) add("Top Load");
  if (/front load/i.test(text)) add("Front Load");
  if (/semi automatic/i.test(text)) add("Semi Automatic");
  if (/fully automatic/i.test(text)) add("Fully Automatic");
  if (/inverter/i.test(text)) add("Inverter");
  if (/direct drive/i.test(text)) add("Direct Drive");
  if (/5\s*star/i.test(text)) add("5 Star");
  if (/oled|amoled/i.test(text)) add("OLED/AMOLED");
  if (/4k|8k/i.test(text)) add("High-resolution display");
  if (/5g/i.test(text)) add("5G");
  if (/bluetooth/i.test(text)) add("Bluetooth");
  if (/wireless/i.test(text)) add("Wireless");
  if (/waterproof|water resistant/i.test(text)) add("Water resistant");
  if (/fast charg/i.test(text)) add("Fast charging");
  if (/in-built heater|built-in heater/i.test(text)) add("Built-in Heater");

  if (words.length) {
    return words.slice(0, 4).join(" · ");
  }

  return "Matched product with comparable specifications across marketplaces.";
}

function getProductImage(amazon, flipkart) {
  return (
    amazon?.image_url ||
    amazon?.image ||
    amazon?.imageUrl ||
    flipkart?.image_url ||
    flipkart?.image ||
    flipkart?.imageUrl ||
    ""
  );
}

function getMatchScore(comparison) {
  return Math.round(
    comparison?.match?.score ??
    comparison?.match_score ??
    comparison?.score ??
    0
  );
}

export default function SearchResults() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const query = (params.get("q") || "").trim();

  const [searchData, setSearchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeRequestRef = useRef(null);

  useEffect(() => {
    if (!query) {
      setSearchData(null);
      setError("");
      setLoading(false);
      return;
    }

    const cached = readCachedSearch(query);

    if (cached) {
      console.log(
        `[SmartBuy Frontend] Using cached results for "${query}"`
      );
      setSearchData(cached);
      setError("");
      setLoading(false);
      return;
    }

    if (activeRequestRef.current?.query === query) {
      console.log(
        `[SmartBuy Frontend] Request already running for "${query}"`
      );
      return;
    }

    const controller = new AbortController();

    activeRequestRef.current = {
      query,
      controller,
    };

    const fetchSearch = async () => {
      setLoading(true);
      setError("");

      const url =
        `${API_BASE}/api/search/live` +
        `?q=${encodeURIComponent(query)}` +
        `&pages=1` +
        `&min_score=62`;

      console.log("[SmartBuy Frontend] Request:", url);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok || data.success !== true) {
          throw new Error(
            data.error ||
              data.message ||
              "Search could not be completed"
          );
        }

        saveCachedSearch(query, data);
        setSearchData(data);
      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("[SmartBuy Frontend] Search error:", err);
        setError(err.message || "Search could not be completed");
      } finally {
        if (activeRequestRef.current?.query === query) {
          activeRequestRef.current = null;
        }
        setLoading(false);
      }
    };

    fetchSearch();

    return () => {
      // Intentionally don't abort during React StrictMode's development remount.
    };
  }, [query]);

  const comparisons = searchData?.comparisons || [];
  const summary = searchData?.summary || {};

  const handleNewSearch = (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const newQuery = String(formData.get("query") || "").trim();

    if (!newQuery) return;

    navigate(`/search?q=${encodeURIComponent(newQuery)}`);
  };

  const openProduct = (comparison, index) => {
    navigate(`/product/${index + 1}`, {
      state: {
        comparison,
        searchQuery: query,
      },
    });
  };

  if (!query) {
    return (
      <main className="search-results-page">
        <div className="search-results-empty">
          <h1>Search for a product</h1>
          <p>
            Enter a product name to compare Amazon and Flipkart results.
          </p>

          <form onSubmit={handleNewSearch}>
            <input
              name="query"
              type="text"
              placeholder="Search products..."
            />
            <button type="submit">Search</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="search-results-page">
      <section className="search-results-header">
        <div>
          <p className="eyebrow">LIVE COMPARISON</p>

          <h1>
            Search results for <span>"{query}"</span>
          </h1>

          {!loading && searchData && (
            <p>
              {summary.amazon_products || 0} Amazon products
              {" · "}
              {summary.flipkart_products || 0} Flipkart products
              {" · "}
              {summary.matched_products || 0} matched products
            </p>
          )}
        </div>

        <form
          className="search-results-search"
          onSubmit={handleNewSearch}
        >
          <input
            name="query"
            type="text"
            defaultValue={query}
            placeholder="Search another product..."
          />
          <button type="submit">Search</button>
        </form>
      </section>

      {loading && (
        <section className="search-results-loading">
          <div className="loading-spinner" />
          <h2>Finding the best matches...</h2>
          <p>
            SmartBuy is collecting products and matching equivalent
            products across platforms.
          </p>
        </section>
      )}

      {error && !loading && (
        <section className="search-results-error">
          <h2>Search could not be completed</h2>
          <p>{error}</p>

          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(getCacheKey(query));
              } catch {}

              setSearchData(null);
              navigate(
                `/search?q=${encodeURIComponent(query)}&retry=${Date.now()}`
              );
            }}
          >
            Try Again
          </button>
        </section>
      )}

      {!loading &&
        !error &&
        searchData &&
        comparisons.length === 0 && (
          <section className="search-results-empty">
            <h2>No cross-platform matches found</h2>
            <p>
              Products were found, but SmartBuy could not confidently
              identify the same product on both platforms.
            </p>
          </section>
        )}

      {!loading &&
        !error &&
        comparisons.length > 0 && (
          <section className="search-results-grid">
            {comparisons.map((comparison, index) => {
              const amazon = comparison.offers?.find(
                (offer) => offer.platform === "Amazon"
              );

              const flipkart = comparison.offers?.find(
                (offer) => offer.platform === "Flipkart"
              );

              const imageUrl = getProductImage(amazon, flipkart);
              const productName = getProductName(amazon, flipkart);
              const variants = extractVariants(amazon, flipkart);
              const description = getProductDescription(amazon, flipkart);

              return (
                <article
                  className="search-result-card"
                  key={`${query}-${index}`}
                >
                  <div className="search-result-card-top">
                    <span>Match {getMatchScore(comparison)}%</span>
                    <span>Same product family</span>
                  </div>

                  <div className="search-result-image-wrap">
                    {imageUrl ? (
                      <img
                        className="search-result-image"
                        src={imageUrl}
                        alt={productName}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.nextElementSibling.style.display =
                            "block";
                        }}
                      />
                    ) : null}

                    <div
                      className="search-result-image-fallback"
                      style={{
                        display: imageUrl ? "none" : "block",
                      }}
                    >
                      Product image unavailable
                    </div>
                  </div>

                  <h2>{productName}</h2>

                  {variants.length > 0 && (
                    <div className="search-result-variants">
                      <span className="variant-label">Key variants</span>
                      <div className="variant-list">
                        {variants.map((variant) => (
                          <span key={variant} className="variant-chip">
                            {variant}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="search-result-description">
                    {description}
                  </p>

                  <button
                    type="button"
                    onClick={() => openProduct(comparison, index)}
                  >
                    View Product Details →
                  </button>
                </article>
              );
            })}
          </section>
        )}
    </main>
  );
}

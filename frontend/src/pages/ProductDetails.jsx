import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "./ProductDetails.css";

const HIDDEN_KEYS = new Set([
  "title", "name", "description", "url", "link", "product_url", "productUrl",
  "image", "image_url", "imageUrl", "platform", "source", "store",
  "price", "current_price", "currentPrice", "rating", "reviews",
  "review_count", "reviewCount", "match", "score", "confidence", "reason",
  "brand", "model", "model_number", "modelNumber", "category"
]);

const ID_KEYS = new Set([
  "asin", "sku", "product_id", "productId", "item_id", "itemId",
  "catalog_id", "catalogId"
]);

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && String(value).trim() !== ""
  );
}

function getOffers(comparison) {
  if (Array.isArray(comparison?.offers)) {
    return comparison.offers.filter(Boolean);
  }

  const possible = [
    comparison?.amazon,
    comparison?.flipkart,
    comparison?.first,
    comparison?.second,
    comparison?.first_product,
    comparison?.second_product,
    comparison?.first_platform,
    comparison?.second_platform
  ].filter(Boolean);

  return possible.filter(
    (item, index, array) =>
      array.findIndex(
        (other) =>
          firstValue(other?.platform, other?.source, other?.store) ===
          firstValue(item?.platform, item?.source, item?.store)
      ) === index
  );
}

function getOfferTitle(offer) {
  return firstValue(offer?.title, offer?.name, "Product") || "Product";
}

function getImage(offer) {
  return firstValue(
    offer?.image_url,
    offer?.image,
    offer?.imageUrl,
    offer?.thumbnail,
    offer?.thumbnail_url
  );
}

function getPrice(offer) {
  const value = firstValue(
    offer?.price,
    offer?.current_price,
    offer?.currentPrice,
    offer?.sale_price,
    offer?.salePrice
  );

  if (value === undefined) return null;

  const number = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : value;
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return `₹${value.toLocaleString("en-IN")}`;
  }
  return String(value).startsWith("₹") ? String(value) : `₹${value}`;
}

function getRating(offer) {
  const value = firstValue(offer?.rating, offer?.stars, offer?.review_rating);
  if (value === undefined) return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number.toFixed(1) : String(value);
}

function getReviewCount(offer) {
  return firstValue(
    offer?.review_count,
    offer?.reviewCount,
    offer?.reviews_count,
    offer?.ratings_count
  );
}

function prettyKey(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMarketplaceId(value) {
  const text = String(value || "").trim();
  return (
    /^B0[A-Z0-9]{8}$/i.test(text) ||
    /^ASIN[:\s_-]/i.test(text) ||
    /^(?:sku|product\s*id|item\s*id|catalog\s*id)[:\s_-]/i.test(text)
  );
}

function cleanSpecValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[|•]+/g, " ")
    .trim();
}

function addAttribute(map, key, value) {
  const cleanKey = prettyKey(key);
  const cleanValue = cleanSpecValue(value);

  if (!cleanKey || !cleanValue) return;
  if (ID_KEYS.has(key) || HIDDEN_KEYS.has(key) || isMarketplaceId(cleanValue)) return;
  if (/^(?:availability|status|position|rank|index)$/i.test(cleanKey)) return;

  if (!map.has(cleanKey)) {
    map.set(cleanKey, cleanValue);
  }
}

function extractTitleSpecifications(title, map) {
  const text = cleanSpecValue(title);

  // Measurements / capacities
  const measurements = [
    ["Capacity", /\b(\d+(?:\.\d+)?)\s*(kg|kg\.|litre|liter|litres|l)\b/i],
    ["Weight", /\b(\d+(?:\.\d+)?)\s*(kg|g)\b/i],
    ["Display Size", /\b(\d+(?:\.\d+)?)\s*(inch|inches|")\b/i],
    ["Storage", /\b(\d+(?:\.\d+)?)\s*(gb|tb|mb)\s*(?:ssd|hdd|storage)?\b/i],
    ["RAM", /\b(\d+(?:\.\d+)?)\s*gb\s*(?:lpddr\d*|ddr\d*)?\s*ram\b/i],
    ["Battery", /\b(\d+(?:\.\d+)?)\s*(mah|mAh)\b/i],
    ["Power", /\b(\d+(?:\.\d+)?)\s*(w|watts?)\b/i],
    ["Camera", /\b(\d+(?:\.\d+)?)\s*(mp|megapixel|megapixels)\b/i]
  ];

  for (const [label, pattern] of measurements) {
    const match = text.match(pattern);
    if (!match) continue;

    // kg/litre in a product title usually means capacity for appliances,
    // while a standalone kg/g is more likely to be physical weight.
    if (label === "Weight" && /\b(?:washing machine|refrigerator|fridge|air conditioner|cooler|dishwasher)\b/i.test(text)) {
      continue;
    }

    let value = `${match[1]} ${match[2]}`;
    if (label === "Storage" && /\bssd\b/i.test(text)) value += " SSD";
    if (label === "Storage" && /\bhdd\b/i.test(text)) value += " HDD";
    addAttribute(map, label, value);
  }

  // CPU / chipset / processor
  const processor = text.match(
    /\b(?:intel\s+)?(?:core\s+)?(?:i[3579]|ultra\s*[3579])(?:\s+\d+(?:st|nd|rd|th)\s+gen)?(?:\s+[a-z0-9-]+)?\b|\b(?:amd\s+)?ryzen\s+[3579]\s*[-\w]*\b|\bsnapdragon\s+[\w-]+\b|\bmediatek\s+[\w-]+\b|\bapple\s+m[1-9]\w*\b/i
  );
  if (processor) addAttribute(map, "Processor", processor[0]);

  // Product configuration/type
  const configurations = [
    ["Type", /\b(front load|top load|semi automatic|fully automatic|inverter|direct drive|belt drive|over-ear|on-ear|in-ear|mirrorless|dslr|laser|inkjet|mechanical|wireless)\b/i],
    ["Operating System", /\b(windows\s+\d+(?:\s+home|\s+pro)?|macos\s+[\w.]*|android\s+[\w.]*|chromeos|linux|ios)\b/i],
    ["Connectivity", /\b(5g|4g|wi-?fi|bluetooth|usb(?:-c)?|hdmi|nfc)\b/i],
    ["Colour", /\b(black|white|blue|red|green|silver|grey|gray|gold|purple|pink|navy|beige|brown)\b/i],
    ["Energy Rating", /\b([1-5]\s*star)\b/i]
  ];

  for (const [label, pattern] of configurations) {
    const match = text.match(pattern);
    if (match) addAttribute(map, label, match[1]);
  }

  // Common storage wording where RAM and storage appear separately.
  const ramLoose = text.match(/\b(\d+)\s*gb\s*(?:lpddr\d*|ddr\d*)?\s*ram\b/i);
  if (ramLoose) addAttribute(map, "RAM", `${ramLoose[1]} GB`);

  const storageLoose = text.match(/\b(\d+)\s*gb\s*(ssd|hdd|storage)\b/i);
  if (storageLoose) addAttribute(map, "Storage", `${storageLoose[1]} GB ${storageLoose[2].toUpperCase()}`);

  // Explicit model/product code, but never marketplace IDs.
  const model = text.match(/\b[A-Z]{1,5}\d{2,}[A-Z0-9-]*\b/);
  if (model && !isMarketplaceId(model[0])) {
    addAttribute(map, "Model", model[0]);
  }
}

function collectAttributes(offers) {
  const attributes = new Map();

  for (const offer of offers) {
    const groups = [
      offer?.specifications,
      offer?.specs,
      offer?.attributes,
      offer?.features
    ];

    for (const group of groups) {
      if (!group || typeof group !== "object" || Array.isArray(group)) continue;

      for (const [key, value] of Object.entries(group)) {
        if (
          value === undefined ||
          value === null ||
          String(value).trim() === "" ||
          ID_KEYS.has(key) ||
          HIDDEN_KEYS.has(key)
        ) continue;

        const clean = Array.isArray(value)
          ? value.join(", ")
          : String(value).trim();

        addAttribute(attributes, key, clean);
      }
    }

    // If the scraper exposes structured fields directly, use them.
    const directFields = [
      ["Brand", offer?.brand],
      ["Model", offer?.model],
      ["Model", offer?.model_number],
      ["Processor", offer?.processor],
      ["Memory", offer?.memory],
      ["RAM", offer?.ram],
      ["Storage", offer?.storage],
      ["Display", offer?.display],
      ["Screen Size", offer?.screen_size],
      ["Capacity", offer?.capacity],
      ["Colour", offer?.color || offer?.colour],
      ["Connectivity", offer?.connectivity],
      ["Operating System", offer?.operating_system || offer?.os],
      ["Battery", offer?.battery],
      ["Weight", offer?.weight],
      ["Type", offer?.type],
      ["Energy Rating", offer?.energy_rating]
    ];

    for (const [key, value] of directFields) {
      if (value !== undefined && value !== null && String(value).trim()) {
        addAttribute(attributes, key, value);
      }
    }

    // Critical fallback: real marketplace scrapers often return a rich title
    // but no structured specification object.
    extractTitleSpecifications(getOfferTitle(offer), attributes);
  }

  // Remove duplicate/conflicting generic fields and keep the useful details.
  const priority = [
    "Brand", "Model", "Processor", "RAM", "Memory", "Storage",
    "Display", "Display Size", "Screen Size", "Capacity", "Type",
    "Operating System", "Connectivity", "Battery", "Camera",
    "Weight", "Colour", "Energy Rating", "Power"
  ];

  const entries = [...attributes.entries()];
  entries.sort((a, b) => {
    const ai = priority.indexOf(a[0]);
    const bi = priority.indexOf(b[0]);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  if (entries.length === 0) {
    const title = getOfferTitle(offers[0] || "");
    if (title && title !== "Product") {
      addAttribute(attributes, "Product listing", title);
    }
  }

  return entries.slice(0, 16);
}

function extractVariantDetails(offers) {
  const text = offers.map(getOfferTitle).join(" ");
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|lbs|litre|liter|litres|ml)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:inch|inches|")\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:gb|tb|mb)\b/gi,
    /\b\d+\s*gb\s*ram\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:mp|mah|w|hz|rpm|pa|bar)\b/gi,
    /\b(?:4g|5g|wifi|wi-fi|bluetooth)\b/gi,
    /\b(?:top load|front load|semi automatic|fully automatic|inverter|direct drive|belt drive)\b/gi,
    /\b(?:black|white|blue|red|green|silver|grey|gray|gold|purple|pink|navy|beige|brown)\b/gi
  ];

  const values = [];
  for (const pattern of patterns) {
    values.push(...(text.match(pattern) || []));
  }

  const unique = new Map();
  for (const value of values.map((v) => v.replace(/\s+/g, " ").trim())) {
    const key = value.toLowerCase();
    if (!unique.has(key)) unique.set(key, value);
  }

  return [...unique.values()].slice(0, 12);
}

function getBrand(comparison, offers) {
  return firstValue(
    comparison?.brand,
    offers[0]?.brand,
    offers[1]?.brand
  );
}

function getCategory(comparison, offers) {
  return firstValue(
    comparison?.category,
    offers[0]?.category,
    offers[1]?.category
  );
}

function isSpecToken(token) {
  const value = String(token || "").trim();
  const lower = value.toLowerCase();

  return (
    isMarketplaceId(value) ||
    /^(?:\d+(?:\.\d+)?)(?:kg|g|mg|lb|lbs|l|ml|gb|tb|mb|inch|inches|hz|mah|mp|w|rpm|pa|bar)$/i.test(value) ||
    /^(?:4g|5g|wifi|wi-fi|bluetooth|oled|amoled|lcd|led)$/i.test(value) ||
    /^(?:black|white|blue|red|green|silver|grey|gray|gold|purple|pink|navy|beige|brown)$/i.test(value) ||
    /^(?:ram|ssd|hdd|storage|memory|display|screen|battery|processor|graphics|windows|android|ios)$/i.test(lower) ||
    /^(?:star|rating|rated|automatic|wireless|smart|digital|display|home|edition|series)$/i.test(lower)
  );
}

function buildConciseName(title, brand = "") {
  let text = String(title || "")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = text.split(/\s+/);
  const result = [];
  const brandLower = String(brand || "").toLowerCase();

  for (const token of rawTokens) {
    const clean = token.replace(/^[|,;:]+|[|,;:]+$/g, "");
    if (!clean || isMarketplaceId(clean)) continue;

    // Stop once the title clearly enters specification/marketing territory.
    if (
      /^\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|lbs|l|ml|gb|tb|mb|inch|inches|hz|mah|mp|w|rpm|pa|bar)$/i.test(clean) ||
      /^(?:ram|ssd|hdd|storage|memory|battery|display|screen|processor|windows|android|ios)$/i.test(clean)
    ) {
      break;
    }

    if (isSpecToken(clean)) continue;

    // Avoid common marketplace marketing filler.
    if (
      /^(?:with|for|and|the|new|latest|best|pure|thin|light|laptop|smartphone|mobile|phone|computer|tablet|tv|television|washing|machine|fully|automatic|top|load|front|star|5g|4g)$/i.test(clean)
    ) {
      if (result.length >= 2) break;
      continue;
    }

    result.push(clean);

    // Product identities are intentionally short on this page.
    if (result.length >= 6) break;
  }

  const candidate = result.join(" ").trim();

  if (candidate) {
    if (brand && !candidate.toLowerCase().startsWith(brandLower)) {
      return `${brand} ${candidate}`.trim();
    }
    return candidate;
  }

  return brand || "Product";
}

function getCommonName(comparison, offers) {
  const brand = getBrand(comparison, offers) || "";

  const explicitModel = firstValue(
    offers[0]?.model,
    offers[1]?.model,
    offers[0]?.model_number,
    offers[1]?.model_number
  );

  if (brand && explicitModel && !isMarketplaceId(explicitModel)) {
    const model = String(explicitModel).trim();

    // A model field may itself contain a full scraped title.
    if (model.split(/\s+/).length <= 4 && !/[|•]/.test(model)) {
      return `${brand} ${model}`.trim();
    }

    const compactModel = buildConciseName(model, brand);
    if (compactModel !== brand) return compactModel;
  }

  const titles = offers
    .map(getOfferTitle)
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  return buildConciseName(titles[0] || "", brand);
}

function getDescription(comparison, offers) {
  return firstValue(
    comparison?.description,
    offers[0]?.description,
    offers[1]?.description,
    `SmartBuy found this product on ${offers.length} marketplace${offers.length === 1 ? "" : "s"} and matched the available listings.`
  );
}

function ProductDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const comparison = location.state?.comparison;
  const offers = getOffers(comparison);

  if (!comparison || offers.length === 0) {
    return (
      <main className="product-page product-page-empty">
        <div className="product-empty-card">
          <p className="section-eyebrow">PRODUCT DETAILS</p>
          <h1>Product data is unavailable</h1>
          <p>
            Open this product from the SmartBuy search results so the matched
            marketplace listings can be loaded here.
          </p>
          <button type="button" onClick={() => navigate(-1)}>
            ← Back to Results
          </button>
        </div>
      </main>
    );
  }

  const name = getCommonName(comparison, offers);
  const brand = getBrand(comparison, offers);
  const category = getCategory(comparison, offers);
  const image = getImage(offers[0]);
  let variants = [];
  let attributes = [];

  try {
    variants = extractVariantDetails(offers);
  } catch (error) {
    console.warn("SmartBuy: variant extraction failed:", error);
  }

  try {
    attributes = collectAttributes(offers);
  } catch (error) {
    console.warn("SmartBuy: specification extraction failed:", error);
    attributes = [];
  }

  const pricedOffers = offers
    .map((offer) => ({ offer, price: getPrice(offer) }))
    .filter(({ price }) => typeof price === "number");

  const lowest = pricedOffers.length
    ? Math.min(...pricedOffers.map(({ price }) => price))
    : null;

  return (
    <main className="product-page">
      <div className="product-breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>Search Results</span>
        <span>/</span>
        <span>{name}</span>
      </div>

      <section className="product-overview">
        <div className="product-image-area">
          <div className="product-image">
            {image ? (
              <img src={image} alt={name} />
            ) : (
              <span>Product image unavailable</span>
            )}
          </div>
        </div>

        <div className="product-information">
          <div className="product-tag">
            MATCHED PRODUCT
          </div>

          <h1>{name}</h1>

          <p className="product-brand">
            {brand || "Brand not available"}
            {category ? ` · ${category}` : ""}
          </p>

          <div className="match-summary">
            <strong>
              Match {Math.round(comparison?.match?.score ?? comparison?.score ?? 0)}%
            </strong>
            <span>Same product family across marketplaces</span>
          </div>

          <p className="product-description">{getDescription(comparison, offers)}</p>

          {attributes.length > 0 && (
            <div className="overview-details">
              {attributes.slice(0, 8).map(([key, value]) => (
                <div className="overview-detail" key={`overview-${key}`}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}

          {variants.length > 0 && (
            <div className="variant-section">
              <p className="detail-label">KEY VARIANTS</p>
              <div className="variant-list">
                {variants.map((variant) => (
                  <span key={variant}>{variant}</span>
                ))}
              </div>
            </div>
          )}

          <div className="overview-stat">
            <div>
              <span>Available on</span>
              <strong>{offers.length} marketplaces</strong>
            </div>
            <div>
              <span>Best current price</span>
              <strong>{formatPrice(lowest)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="price-summary">
        <div className="price-heading">
          <div>
            <p className="section-eyebrow">LIVE MARKETPLACE OFFERS</p>
            <h2>Compare available prices</h2>
          </div>

          <div className="lowest-price">
            <small>Lowest current price</small>
            <strong>{formatPrice(lowest)}</strong>
            <span>Among matched listings</span>
          </div>
        </div>

        <div className="offer-list">
          {offers.map((offer, index) => {
            const price = getPrice(offer);
            const rating = getRating(offer);
            const reviewCount = getReviewCount(offer);
            const url = firstValue(
              offer?.url,
              offer?.link,
              offer?.product_url,
              offer?.productUrl
            );
            const provider = firstValue(
              offer?.platform,
              offer?.source,
              offer?.store,
              `Store ${index + 1}`
            );

            return (
              <div
                className={`offer-row ${price === lowest ? "recommended" : ""}`}
                key={`${provider}-${index}`}
              >
                <div className="offer-provider">
                  <div className="provider-logo">
                    {String(provider).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong>{provider}</strong>
                    <span>Matched listing</span>
                  </div>
                </div>

                <div className="offer-title">
                  {getOfferTitle(offer)}
                </div>

                <div className="offer-price">
                  <small>Current price</small>
                  <strong>{formatPrice(price)}</strong>
                </div>

                <div className="offer-rating">
                  {rating ? `★ ${rating}` : "Rating unavailable"}
                  {reviewCount ? ` · ${reviewCount} reviews` : ""}
                </div>

                {url ? (
                  <a
                    className="deal-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Deal →
                  </a>
                ) : (
                  <span className="deal-unavailable">Deal link unavailable</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="comparison-actions">
          <Link to={`/compare/${id}`} state={{ comparison }}>
            Compare All Offers <span>→</span>
          </Link>

          <Link to={`/recommendation/${id}`} state={{ comparison }}>
            ✦ Get Smart Recommendation
          </Link>
        </div>
      </section>

      <section className="product-lower">
        <div className="specification-panel">
          <div className="panel-header">
            <p className="section-eyebrow">PRODUCT DETAILS</p>
            <h2>Specifications</h2>
            <p>
              Specifications are generated dynamically from the marketplace
              data. Fields vary by product category.
            </p>
          </div>

          {attributes.length > 0 ? (
            <div className="spec-grid">
              {attributes.map(([key, value]) => (
                <div className="spec-item" key={`${key}-${value}`}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-specs">
              No structured specifications were returned for this product.
            </div>
          )}
        </div>

        <div className="analysis-panel">
          <p className="section-eyebrow">SMARTBUY ANALYSIS</p>
          <h2>Understand before you buy.</h2>
          <p>
            Use SmartBuy's analysis tools to examine this product beyond its
            current price.
          </p>

          <div className="analysis-links">
            <Link to={`/price-history/${id}`} state={{ comparison }}>
              <span>◷</span>
              <div>
                <strong>Price History</strong>
                <small>Check historical prices →</small>
              </div>
            </Link>

            <Link to={`/reviews/${id}`} state={{ comparison }}>
              <span>◉</span>
              <div>
                <strong>Review Analysis</strong>
                <small>Understand customer feedback →</small>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ProductDetails;

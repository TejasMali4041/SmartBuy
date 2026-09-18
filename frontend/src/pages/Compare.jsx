import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import "./Compare.css";


/* ───────────────────────── helpers ───────────────────────── */

function firstValue(...values) {
  return values.find(
    (v) => v !== undefined && v !== null && String(v).trim() !== ""
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
  ].filter(Boolean);

  return possible.filter(
    (item, i, arr) =>
      arr.findIndex(
        (o) =>
          firstValue(o?.platform, o?.source, o?.store) ===
          firstValue(item?.platform, item?.source, item?.store)
      ) === i
  );
}

function getPlatform(offer, index) {
  return firstValue(
    offer?.platform,
    offer?.source,
    offer?.store,
    `Store ${index + 1}`
  );
}

function getTitle(offer) {
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
  const v = firstValue(
    offer?.price,
    offer?.current_price,
    offer?.currentPrice,
    offer?.sale_price
  );
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getOriginalPrice(offer) {
  const v = firstValue(
    offer?.original_price,
    offer?.originalPrice,
    offer?.mrp,
    offer?.list_price
  );
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getRating(offer) {
  const v = firstValue(offer?.rating, offer?.stars, offer?.review_rating);
  if (v === undefined || v === null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function getReviewCount(offer) {
  const v = firstValue(
    offer?.review_count,
    offer?.reviewCount,
    offer?.reviews_count,
    offer?.ratings_count
  );
  if (v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function getSellerName(offer) {
  return firstValue(
    offer?.seller_name,
    offer?.sellerName,
    offer?.seller,
    offer?.sold_by
  );
}

function getSellerRating(offer) {
  const v = firstValue(
    offer?.seller_rating,
    offer?.sellerRating,
    offer?.seller_star_rating
  );
  if (v === undefined || v === null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function getAvailability(offer) {
  return firstValue(
    offer?.availability,
    offer?.availability_status,
    offer?.stock_status
  );
}

function getDelivery(offer) {
  return firstValue(
    offer?.delivery_text,
    offer?.deliveryText,
    offer?.delivery,
    offer?.shipping
  );
}

function getOfferText(offer) {
  return firstValue(
    offer?.offer_text,
    offer?.offerText,
    offer?.offers,
    offer?.deal,
    offer?.coupon
  );
}

function getUrl(offer) {
  return firstValue(
    offer?.url,
    offer?.link,
    offer?.product_url,
    offer?.productUrl
  );
}

function getLastChecked(offer) {
  return firstValue(offer?.last_checked, offer?.lastChecked);
}

function formatPrice(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return `₹${v.toLocaleString("en-IN")}`;
  return String(v).startsWith("₹") ? String(v) : `₹${v}`;
}

function formatCount(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function discountPercent(price, original) {
  if (
    typeof price !== "number" ||
    typeof original !== "number" ||
    original <= price ||
    original === 0
  )
    return null;
  return Math.round(((original - price) / original) * 100);
}

function platformClass(platform) {
  const lower = String(platform || "").toLowerCase();
  if (lower.includes("amazon")) return "amazon";
  if (lower.includes("flipkart")) return "flipkart";
  if (lower.includes("meesho")) return "meesho";
  return "generic";
}

function starBar(rating) {
  if (rating === null) return 0;
  return Math.min(100, (rating / 5) * 100);
}

/* ───────────── SmartBuy score (mirrors backend weights) ────────────── */

function calcSmartBuyScore(offer, allOffers) {
  const price = getPrice(offer);
  const rating = getRating(offer);
  const reviews = getReviewCount(offer);
  const sellerR = getSellerRating(offer);
  const offerTxt = getOfferText(offer);

  const allPrices = allOffers
    .map(getPrice)
    .filter((p) => typeof p === "number" && p > 0);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : 0;

  const pScore =
    typeof price === "number" && price > 0 && lowestPrice > 0
      ? Math.min(1, lowestPrice / price)
      : 0;
  const rScore = typeof rating === "number" ? Math.min(1, rating / 5) : 0;
  const rvScore = typeof reviews === "number" ? Math.min(1, reviews / 10000) : 0;
  const sScore =
    typeof sellerR === "number" ? Math.min(1, sellerR / 5) : 0.5;
  const oScore = offerTxt && offerTxt !== "Not available" ? 1 : 0;

  return Math.round(
    (pScore * 0.4 + rScore * 0.25 + rvScore * 0.15 + sScore * 0.1 + oScore * 0.1) *
      100
  );
}


/* ───────────────────────── winner detection ───────────────────────── */

function detectWinners(enriched) {
  const winners = {};

  // Lowest price
  const priced = enriched.filter((e) => typeof e.price === "number");
  if (priced.length > 1) {
    const min = Math.min(...priced.map((e) => e.price));
    const winning = priced.filter((e) => e.price === min);
    if (winning.length === 1) winners.price = winning[0].index;
  }

  // Highest rating
  const rated = enriched.filter((e) => typeof e.rating === "number");
  if (rated.length > 1) {
    const max = Math.max(...rated.map((e) => e.rating));
    const winning = rated.filter((e) => e.rating === max);
    if (winning.length === 1) winners.rating = winning[0].index;
  }

  // Most reviews
  const reviewed = enriched.filter((e) => typeof e.reviews === "number");
  if (reviewed.length > 1) {
    const max = Math.max(...reviewed.map((e) => e.reviews));
    const winning = reviewed.filter((e) => e.reviews === max);
    if (winning.length === 1) winners.reviews = winning[0].index;
  }

  // Biggest discount
  const discounted = enriched.filter((e) => typeof e.discount === "number");
  if (discounted.length > 1) {
    const max = Math.max(...discounted.map((e) => e.discount));
    const winning = discounted.filter((e) => e.discount === max);
    if (winning.length === 1) winners.discount = winning[0].index;
  }

  // Best seller rating
  const sellers = enriched.filter((e) => typeof e.sellerRating === "number");
  if (sellers.length > 1) {
    const max = Math.max(...sellers.map((e) => e.sellerRating));
    const winning = sellers.filter((e) => e.sellerRating === max);
    if (winning.length === 1) winners.sellerRating = winning[0].index;
  }

  // Best SmartBuy score
  if (enriched.length > 1) {
    const max = Math.max(...enriched.map((e) => e.score));
    const winning = enriched.filter((e) => e.score === max);
    if (winning.length === 1) winners.score = winning[0].index;
  }

  return winners;
}


/* ────────────────────────────── component ────────────────────────────── */

function Compare() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const comparison = location.state?.comparison;
  const offers = useMemo(() => getOffers(comparison), [comparison]);

  /* Build enriched data for each offer */
  const enriched = useMemo(
    () =>
      offers.map((offer, index) => {
        const price = getPrice(offer);
        const originalPrice = getOriginalPrice(offer);
        return {
          index,
          offer,
          platform: getPlatform(offer, index),
          title: getTitle(offer),
          image: getImage(offer),
          price,
          originalPrice,
          discount: discountPercent(price, originalPrice),
          rating: getRating(offer),
          reviews: getReviewCount(offer),
          sellerName: getSellerName(offer),
          sellerRating: getSellerRating(offer),
          availability: getAvailability(offer),
          delivery: getDelivery(offer),
          offerText: getOfferText(offer),
          url: getUrl(offer),
          lastChecked: getLastChecked(offer),
          score: calcSmartBuyScore(offer, offers),
        };
      }),
    [offers]
  );

  const winners = useMemo(() => detectWinners(enriched), [enriched]);

  /* Summary stats */
  const bestOverall = enriched.reduce(
    (best, e) => (e.score > (best?.score ?? -1) ? e : best),
    null
  );
  const lowestPriceOffer = enriched
    .filter((e) => typeof e.price === "number")
    .sort((a, b) => a.price - b.price)[0];
  const highestRatedOffer = enriched
    .filter((e) => typeof e.rating === "number")
    .sort((a, b) => b.rating - a.rating)[0];
  const biggestDiscount = enriched
    .filter((e) => typeof e.discount === "number")
    .sort((a, b) => b.discount - a.discount)[0];

  const commonName = useMemo(() => {
    const brand = firstValue(
      comparison?.brand,
      offers[0]?.brand,
      offers[1]?.brand
    );
    const title = getTitle(offers[0]);
    const words = String(title || "")
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");
    return brand && !words.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${words}`
      : words || "Product";
  }, [comparison, offers]);

  const commonImage = getImage(offers[0]);

  /* ── Empty state ── */
  if (!comparison || offers.length === 0) {
    return (
      <main className="compare-page compare-page-empty">
        <div className="compare-empty-card">
          <span className="empty-icon">⚖️</span>
          <p className="section-eyebrow">COMPARISON</p>
          <h1>No comparison data available</h1>
          <p>
            Open this product from SmartBuy search results so marketplace
            listings can be loaded and compared here.
          </p>
          <button type="button" onClick={() => navigate(-1)}>
            ← Back to Results
          </button>
        </div>
      </main>
    );
  }

  /* ── Helper: render a comparison row ── */
  function CompareRow({ label, icon, valueKey, format, winnerKey, highlight }) {
    return (
      <div className="compare-row">
        <div className="compare-row-label">
          <span className="row-icon">{icon}</span>
          <span>{label}</span>
        </div>

        <div className="compare-row-values">
          {enriched.map((e) => {
            const raw = typeof valueKey === "function" ? valueKey(e) : e[valueKey];
            const display = format ? format(raw, e) : (raw ?? "—");
            const isWinner =
              winnerKey && winners[winnerKey] === e.index;
            const isNA =
              display === "—" ||
              display === "Not available" ||
              display === null ||
              display === undefined;

            return (
              <div
                className={`compare-cell ${isWinner ? "winner" : ""} ${isNA ? "na" : ""} ${highlight ? "highlight" : ""}`}
                key={e.index}
              >
                {isWinner && <span className="winner-badge">Best</span>}
                <span className="cell-value">{display}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }


  return (
    <main className="compare-page" style={{ "--offer-count": enriched.length }}>

      {/* Breadcrumb */}
      <div className="compare-breadcrumb">
        <Link to={`/product/${id}`} state={{ comparison }}>
          ← Back to Product
        </Link>
      </div>

      {/* ─── Header ─── */}
      <section className="compare-header">
        <div className="compare-header-text">
          <p className="section-eyebrow">SMARTBUY COMPARISON</p>
          <h1>Side-by-side comparison</h1>
          <p className="compare-subtitle">
            Every detail compared so you can make the smartest buying decision.
          </p>
        </div>

        <div className="compare-product">
          <div className="mini-product-image">
            {commonImage ? (
              <img src={commonImage} alt={commonName} />
            ) : (
              "Product"
            )}
          </div>
          <div>
            <strong>{commonName}</strong>
            <span>{enriched.length} offers compared</span>
          </div>
        </div>
      </section>

      {/* ─── Summary Cards ─── */}
      <section className="comparison-summary">

        <div className={`summary-card ${bestOverall ? "best" : ""}`}>
          <span className="summary-icon">🏆</span>
          <div>
            <small>Best Overall</small>
            <strong>{bestOverall ? bestOverall.platform : "—"}</strong>
            <p>SmartBuy Score {bestOverall?.score ?? "—"}/100</p>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon">₹</span>
          <div>
            <small>Lowest Price</small>
            <strong>{lowestPriceOffer ? formatPrice(lowestPriceOffer.price) : "—"}</strong>
            <p>{lowestPriceOffer ? lowestPriceOffer.platform : "Best available deal"}</p>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon">⭐</span>
          <div>
            <small>Highest Rated</small>
            <strong>{highestRatedOffer ? `${highestRatedOffer.rating.toFixed(1)} / 5` : "—"}</strong>
            <p>{highestRatedOffer ? highestRatedOffer.platform : "Based on ratings"}</p>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon">🏷️</span>
          <div>
            <small>Biggest Savings</small>
            <strong>{biggestDiscount ? `${biggestDiscount.discount}% OFF` : "—"}</strong>
            <p>{biggestDiscount ? biggestDiscount.platform : "Best discount"}</p>
          </div>
        </div>

      </section>

      {/* ─── Platform Headers ─── */}
      <section className="compare-platforms">
        <div className="platform-label-spacer" />
        {enriched.map((e) => (
          <div className={`platform-header platform-${platformClass(e.platform)}`} key={e.index}>
            <div className={`platform-logo ${platformClass(e.platform)}-logo`}>
              {String(e.platform).charAt(0).toUpperCase()}
            </div>
            <div className="platform-meta">
              <strong>{e.platform}</strong>
              {winners.score === e.index && (
                <span className="platform-recommended">★ Recommended</span>
              )}
            </div>
            <div className="platform-score">
              <div className="score-ring">
                <svg viewBox="0 0 36 36">
                  <path
                    className="score-ring-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="score-ring-fill"
                    strokeDasharray={`${e.score}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="score-number">{e.score}</span>
              </div>
              <small>SmartBuy Score</small>
            </div>
          </div>
        ))}
      </section>

      {/* ─── Comparison Table ─── */}
      <section className="compare-table-section">
        <div className="compare-table-header">
          <h2>Complete comparison</h2>
          <p>Every detail from each marketplace listing, side by side.</p>
        </div>

        <div className="compare-table">

          {/* Product Image */}
          <div className="compare-row compare-row-images">
            <div className="compare-row-label">
              <span className="row-icon">🖼️</span>
              <span>Product Image</span>
            </div>
            <div className="compare-row-values">
              {enriched.map((e) => (
                <div className="compare-cell image-cell" key={e.index}>
                  {e.image ? (
                    <img src={e.image} alt={e.title} className="compare-product-img" />
                  ) : (
                    <div className="no-image">No image</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Product Title */}
          <div className="compare-row">
            <div className="compare-row-label">
              <span className="row-icon">📦</span>
              <span>Product Title</span>
            </div>
            <div className="compare-row-values">
              {enriched.map((e) => (
                <div className="compare-cell title-cell" key={e.index}>
                  <span className="cell-value cell-title">{e.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Section Header */}
          <div className="compare-section-divider">
            <span>💰 Pricing</span>
          </div>

          <CompareRow
            label="Current Price"
            icon="💵"
            valueKey="price"
            format={(v) => formatPrice(v)}
            winnerKey="price"
            highlight
          />

          <CompareRow
            label="Original Price (MRP)"
            icon="🏷️"
            valueKey="originalPrice"
            format={(v) => formatPrice(v)}
          />

          <CompareRow
            label="Discount"
            icon="📉"
            valueKey="discount"
            format={(v) => (typeof v === "number" ? `${v}% OFF` : "—")}
            winnerKey="discount"
          />

          {/* Ratings Section Header */}
          <div className="compare-section-divider">
            <span>⭐ Ratings & Reviews</span>
          </div>

          {/* Rating with visual bar */}
          <div className="compare-row">
            <div className="compare-row-label">
              <span className="row-icon">⭐</span>
              <span>Rating</span>
            </div>
            <div className="compare-row-values">
              {enriched.map((e) => {
                const isWinner = winners.rating === e.index;
                return (
                  <div className={`compare-cell ${isWinner ? "winner" : ""}`} key={e.index}>
                    {isWinner && <span className="winner-badge">Best</span>}
                    <div className="rating-display">
                      <strong className="rating-value">
                        {e.rating !== null ? e.rating.toFixed(1) : "—"}
                      </strong>
                      <span className="rating-out-of">/ 5</span>
                    </div>
                    {e.rating !== null && (
                      <div className="rating-bar-track">
                        <div
                          className="rating-bar-fill"
                          style={{ width: `${starBar(e.rating)}%` }}
                        />
                      </div>
                    )}
                    <div className="star-display">
                      {e.rating !== null
                        ? "★".repeat(Math.round(e.rating)) +
                          "☆".repeat(5 - Math.round(e.rating))
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <CompareRow
            label="Total Reviews"
            icon="💬"
            valueKey="reviews"
            format={(v) => (typeof v === "number" ? formatCount(v) + " reviews" : "—")}
            winnerKey="reviews"
          />

          {/* Seller Section Header */}
          <div className="compare-section-divider">
            <span>🏪 Seller Information</span>
          </div>

          <CompareRow
            label="Seller Name"
            icon="👤"
            valueKey="sellerName"
            format={(v) => v || "—"}
          />

          <CompareRow
            label="Seller Rating"
            icon="⭐"
            valueKey="sellerRating"
            format={(v) => (typeof v === "number" ? `${v.toFixed(1)} / 5` : "—")}
            winnerKey="sellerRating"
          />

          {/* Delivery Section Header */}
          <div className="compare-section-divider">
            <span>🚚 Delivery & Availability</span>
          </div>

          <CompareRow
            label="Availability"
            icon="✅"
            valueKey="availability"
            format={(v) => v || "—"}
          />

          <CompareRow
            label="Delivery"
            icon="🚚"
            valueKey="delivery"
            format={(v) => v || "—"}
          />

          {/* Offers Section */}
          <div className="compare-section-divider">
            <span>🎁 Offers & Deals</span>
          </div>

          <div className="compare-row">
            <div className="compare-row-label">
              <span className="row-icon">🎫</span>
              <span>Offers / Coupons</span>
            </div>
            <div className="compare-row-values">
              {enriched.map((e) => {
                const text = e.offerText;
                const hasOffer = text && text !== "Not available";
                return (
                  <div className={`compare-cell ${hasOffer ? "" : "na"}`} key={e.index}>
                    {hasOffer ? (
                      <span className="cell-value offer-value">{text}</span>
                    ) : (
                      <span className="cell-value">No offers available</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meta */}
          <div className="compare-section-divider">
            <span>ℹ️ Additional Details</span>
          </div>

          <CompareRow
            label="Last Checked"
            icon="🕐"
            valueKey="lastChecked"
            format={(v) => formatDate(v)}
          />

          {/* Action Buttons */}
          <div className="compare-row compare-row-actions">
            <div className="compare-row-label">
              <span className="row-icon">🔗</span>
              <span>View on Store</span>
            </div>
            <div className="compare-row-values">
              {enriched.map((e) => (
                <div className="compare-cell action-cell" key={e.index}>
                  {e.url ? (
                    <a
                      href={e.url}
                      className={`deal-button deal-${platformClass(e.platform)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on {e.platform} →
                    </a>
                  ) : (
                    <span className="deal-unavailable">Link unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── SmartBuy Score Breakdown ─── */}
      <section className="compare-analysis">
        <div className="analysis-copy">
          <p className="section-eyebrow">SMARTBUY ANALYSIS</p>
          <h2>
            The cheapest offer isn't
            <span> always the best.</span>
          </h2>
          <p>
            SmartBuy evaluates multiple factors so you can understand the
            difference between price and actual value.
          </p>

          <div className="score-weights">
            <div className="weight-item"><span>Price</span><strong>40%</strong></div>
            <div className="weight-item"><span>Rating</span><strong>25%</strong></div>
            <div className="weight-item"><span>Reviews</span><strong>15%</strong></div>
            <div className="weight-item"><span>Seller</span><strong>10%</strong></div>
            <div className="weight-item"><span>Offers</span><strong>10%</strong></div>
          </div>
        </div>

        <div className="score-breakdown">
          {enriched.map((e) => (
            <div className="score-platform-block" key={e.index}>
              <div className="score-platform-name">
                <div className={`platform-dot ${platformClass(e.platform)}-dot`} />
                <strong>{e.platform}</strong>
                <span className="score-total">{e.score}/100</span>
              </div>

              {[
                { label: "Price", value: Math.round(e.score * 0.4 / 0.4) * 0.4, max: 40 },
                { label: "Rating", value: (getRating(e.offer) !== null ? Math.min(1, getRating(e.offer) / 5) : 0) * 25, max: 25 },
                { label: "Reviews", value: (getReviewCount(e.offer) !== null ? Math.min(1, getReviewCount(e.offer) / 10000) : 0) * 15, max: 15 },
                { label: "Seller", value: (getSellerRating(e.offer) !== null ? Math.min(1, getSellerRating(e.offer) / 5) : 0.5) * 10, max: 10 },
                { label: "Offers", value: (e.offerText && e.offerText !== "Not available" ? 1 : 0) * 10, max: 10 },
              ].map((factor) => (
                <div className="score-row" key={`${e.index}-${factor.label}`}>
                  <span className="score-label">{factor.label}</span>
                  <div className="score-bar">
                    <div
                      className="score-bar-fill"
                      style={{ width: `${(factor.value / factor.max) * 100}%` }}
                    />
                  </div>
                  <strong>{Math.round(factor.value)}/{factor.max}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="compare-cta">
        <div>
          <h2>Want SmartBuy to choose for you?</h2>
          <p>
            Get a personalized recommendation based on multiple purchase factors.
          </p>
        </div>
        <Link
          to={`/recommendation/${id}`}
          state={{ comparison }}
          className="recommend-button"
        >
          ✦ Get Smart Recommendation
        </Link>
      </section>

    </main>
  );
}

export default Compare;
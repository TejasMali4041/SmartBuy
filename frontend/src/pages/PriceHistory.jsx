import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "./PriceHistory.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

/* ───────────────────────── Helpers ───────────────────────── */

function firstValue(...values) {
  return values.find(
    (v) => v !== undefined && v !== null && String(v).trim() !== ""
  );
}

function parsePrice(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return "₹" + Math.round(val).toLocaleString("en-IN");
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
    (item, index, arr) =>
      arr.findIndex(
        (o) =>
          firstValue(o?.platform, o?.source, o?.store) ===
          firstValue(item?.platform, item?.source, item?.store)
      ) === index
  );
}

function getProductName(comparison, offers) {
  return (
    firstValue(
      comparison?.name,
      comparison?.title,
      comparison?.product_name,
      offers[0]?.title,
      offers[0]?.name,
      offers[1]?.title
    ) || "Product"
  );
}

function getProductImage(comparison, offers) {
  return firstValue(
    comparison?.image_url,
    comparison?.image,
    offers[0]?.image_url,
    offers[0]?.image,
    offers[1]?.image_url
  );
}

function getBrand(comparison, offers) {
  return firstValue(
    comparison?.brand,
    offers[0]?.brand,
    offers[1]?.brand
  );
}

/* ───────────────────────── Main Component ───────────────────────── */

export default function PriceHistory() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [comparison, setComparison] = useState(() => {
    if (location.state?.comparison) {
      sessionStorage.setItem("smartbuy_active_comparison", JSON.stringify(location.state.comparison));
      return location.state.comparison;
    }
    try {
      const cached = sessionStorage.getItem("smartbuy_active_comparison");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [dbProductHistory, setDbProductHistory] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Timeframe and platform view filters
  const [timeframe, setTimeframe] = useState("90D"); // "30D" | "90D" | "180D" | "ALL"
  const [platformFilter, setPlatformFilter] = useState("both"); // "both" | "amazon" | "flipkart"

  // Price Drop Alert state
  const [targetPriceInput, setTargetPriceInput] = useState("");
  const [alertSuccessToast, setAlertSuccessToast] = useState("");

  // Chart hover crosshair state
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const offers = useMemo(() => getOffers(comparison), [comparison]);
  const productName = getProductName(comparison, offers);
  const productImage = getProductImage(comparison, offers);
  const brand = getBrand(comparison, offers);

  // Helper to verify if a database record actually matches the current inspected product
  const isGenuineDbMatch = (dbProduct, curName, curBrand) => {
    if (!dbProduct || !curName) return false;
    const dbName = (dbProduct.product_name || dbProduct.name || "").toLowerCase().trim();
    const cleanCur = curName.toLowerCase().trim();
    const dbBrand = (dbProduct.brand || "").toLowerCase().trim();
    const cleanBrand = (curBrand || "").toLowerCase().trim();

    // 1. Strict Brand Check: If brands differ (e.g. "Godrej" vs "Whirlpool"), NEVER cross-match!
    if (cleanBrand && dbBrand && cleanBrand !== dbBrand) {
      return false;
    }
    if (cleanBrand && !dbName.includes(cleanBrand)) {
      return false;
    }

    // 2. Meaningful keyword overlap
    const getTokens = (str) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !/^(with|from|star|model|fully|automatic)$/.test(t));

    const dbTokens = new Set(getTokens(dbName));
    const curTokens = getTokens(cleanCur);

    let matchCount = 0;
    for (const token of curTokens) {
      if (dbTokens.has(token)) matchCount++;
    }

    return matchCount >= 3;
  };

  // 1. Check if database has genuine price history for THIS specific product
  useEffect(() => {
    let active = true;
    setLoading(true);

    const tryFetchHistory = async () => {
      // Case A: Opened from a direct database link (e.g. Watchlist or direct URL without live comparison)
      if (!comparison && /^\d+$/.test(id)) {
        try {
          const res = await fetch(`${API_BASE}/api/products/${id}/history`);
          if (res.ok) {
            const data = await res.json();
            if (active && data && data.offers && data.offers.length > 0) {
              setDbProductHistory(data);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("DB history check by ID failed:", e);
        }
      }

      // Case B: Opened from a live search comparison.
      // Search index 'id' is NOT the database ID! We only match if the DB has this exact product.
      if (productName && productName !== "Product") {
        try {
          // Search DB for this specific product title or brand
          const queryStr = brand ? `${brand} ${productName.slice(0, 30)}` : productName.slice(0, 35);
          const searchRes = await fetch(`${API_BASE}/api/products?q=${encodeURIComponent(queryStr)}`);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const candidates = searchData.products || [];

            // Find a candidate that genuinely matches the brand and title
            const matchedDb = candidates.find((c) => isGenuineDbMatch(c, productName, brand));

            if (matchedDb && matchedDb.id) {
              const histRes = await fetch(`${API_BASE}/api/products/${matchedDb.id}/history`);
              if (histRes.ok) {
                const histData = await histRes.json();
                if (
                  active &&
                  histData &&
                  isGenuineDbMatch(histData, productName, brand) &&
                  histData.offers &&
                  histData.offers.length > 0
                ) {
                  setDbProductHistory(histData);
                  setLoading(false);
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.warn("DB history lookup by title failed:", err);
        }
      }

      // No genuine DB match found: this is a newly discovered live product
      if (active) {
        setDbProductHistory(null);
        setLoading(false);
      }
    };

    tryFetchHistory();
    return () => { active = false; };
  }, [id, comparison, productName, brand]);

  // Extract live offer prices
  const amazonOffer = offers.find(
    (o) => firstValue(o?.platform, o?.source, o?.store)?.toLowerCase() === "amazon"
  );
  const flipkartOffer = offers.find(
    (o) => firstValue(o?.platform, o?.source, o?.store)?.toLowerCase() === "flipkart"
  );

  const amazonPrice = parsePrice(amazonOffer?.price || amazonOffer?.sale_price);
  const flipkartPrice = parsePrice(flipkartOffer?.price || flipkartOffer?.sale_price);
  const mrp = parsePrice(
    amazonOffer?.original_price ||
    flipkartOffer?.original_price ||
    amazonOffer?.mrp ||
    flipkartOffer?.mrp
  );

  // 2. Parse genuine database history timeline points if available
  const dbTimelinePoints = useMemo(() => {
    if (!dbProductHistory || !dbProductHistory.offers) return [];

    // Collate timestamped records from all offers
    const dateMap = new Map();

    dbProductHistory.offers.forEach((off) => {
      const isAmz = off.platform.toLowerCase().includes("amazon");
      const isFlk = off.platform.toLowerCase().includes("flipkart");

      (off.history || []).forEach((pt) => {
        const rawDate = new Date(pt.recorded_at);
        const dateKey = rawDate.toISOString().split("T")[0];
        const displayDate = rawDate.toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        });

        const entry = dateMap.get(dateKey) || {
          dateKey,
          displayDate,
          timestamp: rawDate.getTime(),
          amazon: null,
          flipkart: null,
          other: null,
        };

        if (isAmz) entry.amazon = pt.price;
        else if (isFlk) entry.flipkart = pt.price;
        else entry.other = pt.price;

        entry.lowest = Math.min(...[entry.amazon, entry.flipkart, entry.other].filter(Boolean));
        dateMap.set(dateKey, entry);
      });
    });

    const sorted = Array.from(dateMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    return sorted;
  }, [dbProductHistory]);

  const hasRealDbHistory = dbTimelinePoints.length >= 2;

  // Filter timeline based on selected timeframe
  const filteredTimeline = useMemo(() => {
    if (!hasRealDbHistory) return [];
    if (timeframe === "ALL") return dbTimelinePoints;

    const days = timeframe === "30D" ? 30 : timeframe === "90D" ? 90 : 180;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const pts = dbTimelinePoints.filter((p) => p.timestamp >= cutoff);
    return pts.length >= 2 ? pts : dbTimelinePoints;
  }, [hasRealDbHistory, dbTimelinePoints, timeframe]);

  // Aggregate Real Stats from Database
  const stats = useMemo(() => {
    const liveLow = Math.min(...[amazonPrice, flipkartPrice].filter(Boolean)) || null;

    if (!hasRealDbHistory) {
      return {
        currentLow: liveLow,
        allTimeLow: liveLow,
        allTimeHigh: liveLow,
        averagePrice: liveLow,
        diffFromAvg: 0,
        dropPercent: 0,
        pointCount: liveLow ? 1 : 0,
      };
    }

    const allRecordedPrices = filteredTimeline.flatMap((pt) =>
      [pt.amazon, pt.flipkart, pt.other].filter((v) => v !== null && v !== undefined && v > 0)
    );

    const currentLow = liveLow || allRecordedPrices[allRecordedPrices.length - 1];
    const allTimeLow = Math.min(...allRecordedPrices);
    const allTimeHigh = Math.max(...allRecordedPrices);
    const averagePrice = Math.round(allRecordedPrices.reduce((a, b) => a + b, 0) / (allRecordedPrices.length || 1));
    const diffFromAvg = currentLow && averagePrice ? currentLow - averagePrice : 0;
    const dropPercent = averagePrice && currentLow ? Math.round(((averagePrice - currentLow) / averagePrice) * 100) : 0;

    return {
      currentLow,
      allTimeLow,
      allTimeHigh,
      averagePrice,
      diffFromAvg,
      dropPercent,
      pointCount: allRecordedPrices.length,
    };
  }, [hasRealDbHistory, filteredTimeline, amazonPrice, flipkartPrice]);

  // Smart Buy Verdict (Honest & Transparent)
  const verdict = useMemo(() => {
    const { currentLow, allTimeLow, averagePrice, pointCount } = stats;

    if (!hasRealDbHistory || pointCount <= 1) {
      const discountVsMrp = mrp && currentLow ? Math.round(((mrp - currentLow) / mrp) * 100) : null;
      return {
        type: discountVsMrp && discountVsMrp >= 20 ? "good" : "fair",
        icon: "📍",
        title: "Live Market Rate (Day 1 of Tracking)",
        desc: discountVsMrp
          ? `Current price is ₹${formatINR(currentLow)} (${discountVsMrp}% off MRP of ${formatINR(mrp)}). Start tracking to record daily historical price changes.`
          : `Current live price is ₹${formatINR(currentLow)}. Click 'Start Tracking' to record daily changes into SmartBuy's database.`,
        action: "Track Price",
      };
    }

    if (currentLow <= allTimeLow) {
      return {
        type: "best",
        icon: "🚀",
        title: "Record Lowest Price in Database!",
        desc: `At ${formatINR(currentLow)}, this is the lowest price ever recorded in our database for this product. Excellent time to buy!`,
        action: "All-Time Low",
      };
    }

    if (currentLow <= averagePrice) {
      return {
        type: "good",
        icon: "✅",
        title: "Below Verified Historical Average",
        desc: `Current price is ${formatINR(Math.abs(stats.diffFromAvg))} below the recorded ${timeframe} average of ${formatINR(averagePrice)}.`,
        action: "Good Deal",
      };
    }

    return {
      type: "wait",
      icon: "⏳",
      title: "Above Historical Average Price",
      desc: `Current price is ${formatINR(Math.abs(stats.diffFromAvg))} higher than the recorded average. Setting a price drop alert is recommended.`,
      action: "Wait for Dip",
    };
  }, [stats, hasRealDbHistory, mrp, timeframe]);

  // SVG Chart Geometry for Real Points
  const chartBounds = useMemo(() => {
    if (!hasRealDbHistory || filteredTimeline.length < 2) return null;

    const width = 1000;
    const height = 340;
    const padding = { top: 30, right: 30, bottom: 40, left: 70 };

    const prices = filteredTimeline.flatMap((pt) =>
      [pt.amazon, pt.flipkart, pt.other].filter((v) => v !== null && v !== undefined && v > 0)
    );
    const minP = Math.floor(Math.min(...prices) * 0.98);
    const maxP = Math.ceil(Math.max(...prices) * 1.02);
    const priceRange = maxP - minP || 1;

    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const getX = (idx) => padding.left + (idx / (filteredTimeline.length - 1 || 1)) * innerWidth;
    const getY = (price) => padding.top + innerHeight - ((price - minP) / priceRange) * innerHeight;

    const amzPoints = filteredTimeline
      .map((pt, i) => (pt.amazon ? { x: getX(i), y: getY(pt.amazon) } : null))
      .filter(Boolean);
    const flkPoints = filteredTimeline
      .map((pt, i) => (pt.flipkart ? { x: getX(i), y: getY(pt.flipkart) } : null))
      .filter(Boolean);

    const makePath = (pts) => {
      if (pts.length === 0) return "";
      return pts.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`, "");
    };

    const ySteps = [0, 0.33, 0.66, 1].map((ratio) => {
      const priceVal = Math.round(minP + ratio * priceRange);
      return {
        price: priceVal,
        y: getY(priceVal),
      };
    });

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      minP,
      maxP,
      getX,
      getY,
      amzPath: makePath(amzPoints),
      flkPath: makePath(flkPoints),
      ySteps,
    };
  }, [hasRealDbHistory, filteredTimeline]);

  // Chart Tooltip Tracking
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current || !chartBounds || !filteredTimeline.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = chartBounds.width / rect.width;
    const svgX = clientX * scaleX;

    const ratio = Math.max(0, Math.min(1, (svgX - chartBounds.padding.left) / chartBounds.innerWidth));
    const index = Math.round(ratio * (filteredTimeline.length - 1));

    if (index >= 0 && index < filteredTimeline.length) {
      setHoverIndex(index);
      setHoverPos({
        x: (chartBounds.getX(index) / chartBounds.width) * rect.width,
        y: clientY,
      });
    }
  }, [chartBounds, filteredTimeline]);

  const handleMouseLeave = () => setHoverIndex(null);

  // Quick Preset Alert
  const handlePresetAlert = (percent) => {
    if (!stats.currentLow) return;
    const target = Math.round(stats.currentLow * (1 - percent / 100));
    setTargetPriceInput(target.toString());
  };

  // Start Tracking / Set Alert Handler
  const handleSetAlert = async (e) => {
    e.preventDefault();
    const val = parseFloat(targetPriceInput);
    setTrackingLoading(true);

    try {
      const token = localStorage.getItem("token");
      const payload = {
        name: productName,
        brand,
        category: comparison?.category || "Products",
        image_url: productImage,
        offers: offers.map((o) => ({
          platform: firstValue(o.platform, o.source, o.store),
          title: firstValue(o.title, o.name),
          url: firstValue(o.url, o.product_url, o.link),
          price: parsePrice(o.price || o.sale_price),
          original_price: parsePrice(o.original_price || o.mrp),
          rating: o.rating,
          review_count: o.review_count,
          seller_name: o.seller_name,
        })),
        target_price: val > 0 ? val : null,
      };

      const res = await fetch(`${API_BASE}/api/products/track-live`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setAlertSuccessToast(
          val > 0
            ? `✓ Product added to database & tracking! Alert set for ₹${val.toLocaleString("en-IN")}.`
            : `✓ Product saved to database! Day 1 price point recorded.`
        );

        if (data.product_id) {
          const histRes = await fetch(`${API_BASE}/api/products/${data.product_id}/history`);
          if (histRes.ok) {
            const histData = await histRes.json();
            setDbProductHistory(histData);
          }
        }

        // Save local copy so Profile immediately reflects the alert
        try {
          const localAlerts = JSON.parse(localStorage.getItem("smartbuy_local_alerts") || "[]");
          const updated = localAlerts.filter((a) => a.product_name !== productName);
          updated.unshift({
            id: data?.product_id || Date.now(),
            product_id: data?.product_id || id,
            product_name: productName,
            brand: brand || "",
            image_url: productImage || "",
            target_price: val > 0 ? val : null,
            current_price: stats.currentLow,
            offers: offers,
            created_at: new Date().toISOString(),
          });
          localStorage.setItem("smartbuy_local_alerts", JSON.stringify(updated));
        } catch (storageErr) {
          console.warn("Local alert save failed:", storageErr);
        }
      } else {
        // Fallback local save if endpoint failed
        try {
          const localAlerts = JSON.parse(localStorage.getItem("smartbuy_local_alerts") || "[]");
          const updated = localAlerts.filter((a) => a.product_name !== productName);
          updated.unshift({
            id: Date.now(),
            product_id: id,
            product_name: productName,
            brand: brand || "",
            image_url: productImage || "",
            target_price: val > 0 ? val : null,
            current_price: stats.currentLow,
            offers: offers,
            created_at: new Date().toISOString(),
          });
          localStorage.setItem("smartbuy_local_alerts", JSON.stringify(updated));
        } catch (storageErr) {
          console.warn("Local alert save failed:", storageErr);
        }
        setAlertSuccessToast(`✓ Alert set for ₹${val.toLocaleString("en-IN")}. Saved to your Profile!`);
      }
    } catch (err) {
      console.warn("Track live failed:", err);
      setAlertSuccessToast("✓ Target alert recorded.");
    } finally {
      setTrackingLoading(false);
      setTimeout(() => setAlertSuccessToast(""), 7000);
    }
  };

  // Empty state if nothing loaded
  if (!loading && (!comparison || offers.length === 0) && !dbProductHistory) {
    return (
      <main className="price-history-page">
        <div className="ph-breadcrumb">
          <Link to="/">← Back to Search</Link>
        </div>
        <div className="ph-empty-card">
          <span className="ph-empty-icon">📊</span>
          <h1>Product Unavailable</h1>
          <p>
            Please search for a product and select it to inspect live price
            tracking and database records.
          </p>
          <button type="button" onClick={() => navigate("/")}>
            Search Products →
          </button>
        </div>
      </main>
    );
  }

  const activeHoverPoint = hoverIndex !== null && filteredTimeline ? filteredTimeline[hoverIndex] : null;

  return (
    <main className="price-history-page">
      {/* Breadcrumb */}
      <div className="ph-breadcrumb">
        <Link to={`/product/${id}`} state={{ comparison }}>
          ← Back to Product Details
        </Link>
      </div>

      <div className="ph-container">
        {/* ─── Hero Product Header ─── */}
        <section className="ph-hero-card">
          <div className="ph-hero-left">
            <div className="ph-product-thumb">
              {productImage ? (
                <img src={productImage} alt={productName} />
              ) : (
                <span className="ph-product-thumb-placeholder">🏷️</span>
              )}
            </div>

            <div className="ph-product-meta">
              <div className="ph-eyebrow-row">
                <span className="ph-eyebrow">Price Analytics & Tracking</span>
                {brand && <span className="ph-brand-badge">{brand}</span>}
                {hasRealDbHistory ? (
                  <span className="ph-brand-badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399" }}>
                    🟢 Verified Database Tracking ({stats.pointCount} checks)
                  </span>
                ) : (
                  <span className="ph-brand-badge" style={{ background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa" }}>
                    ⚡ Real-Time Live Market Price
                  </span>
                )}
              </div>
              <h1>{productName}</h1>

              <div className="ph-platforms-summary">
                {amazonPrice && (
                  <span className="ph-store-pill amazon">
                    Amazon: <strong>{formatINR(amazonPrice)}</strong>
                  </span>
                )}
                {flipkartPrice && (
                  <span className="ph-store-pill flipkart">
                    Flipkart: <strong>{formatINR(flipkartPrice)}</strong>
                  </span>
                )}
                {mrp && <span className="ph-mrp">MRP: <del>{formatINR(mrp)}</del></span>}
              </div>
            </div>
          </div>

          <div className="ph-hero-right">
            <Link
              to={`/compare/${id}`}
              state={{ comparison }}
              className="ph-quick-compare-btn"
            >
              Compare Specifications ↗
            </Link>
            <button
              type="button"
              className="ph-bell-btn"
              onClick={() => {
                const el = document.getElementById("price-alert-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              🔔 Track Price
            </button>
          </div>
        </section>

        {/* ─── Smart Buy Verdict Card ─── */}
        <section className={`ph-verdict-card ${verdict.type}`}>
          <div className="ph-verdict-main">
            <div className="ph-verdict-badge-icon">{verdict.icon}</div>
            <div className="ph-verdict-details">
              <div className="ph-verdict-headline">
                <h2>{verdict.title}</h2>
                <span className="ph-verdict-status-tag">{verdict.action}</span>
              </div>
              <p className="ph-verdict-desc">{verdict.desc}</p>
            </div>
          </div>

          {stats.diffFromAvg !== 0 && hasRealDbHistory && (
            <div className="ph-verdict-savings-chip">
              <span>{stats.diffFromAvg < 0 ? "Below Average" : "Above Average"}</span>
              <strong style={{ color: stats.diffFromAvg < 0 ? "#10b981" : "#f87171" }}>
                {stats.diffFromAvg < 0 ? "−" : "+"}{formatINR(Math.abs(stats.diffFromAvg))}
              </strong>
            </div>
          )}
        </section>

        {/* ─── Metric Stat Cards Grid ─── */}
        <section className="ph-metrics-grid">
          {/* Current Live Lowest */}
          <div className="ph-stat-card">
            <div className="ph-stat-header">
              <span className="ph-stat-label">Current Live Best</span>
              <span className="ph-stat-icon">💰</span>
            </div>
            <div className="ph-stat-value">{formatINR(stats.currentLow)}</div>
            <div className="ph-stat-subtext">
              {amazonPrice && flipkartPrice ? (
                amazonPrice < flipkartPrice ? (
                  <span className="ph-badge-delta green">Cheaper on Amazon by {formatINR(flipkartPrice - amazonPrice)}</span>
                ) : flipkartPrice < amazonPrice ? (
                  <span className="ph-badge-delta green">Cheaper on Flipkart by {formatINR(amazonPrice - flipkartPrice)}</span>
                ) : (
                  <span className="ph-badge-delta neutral">Identical on Amazon & Flipkart</span>
                )
              ) : (
                <span>Verified live marketplace offer</span>
              )}
            </div>
          </div>

          {/* Database All-Time Low */}
          <div className="ph-stat-card">
            <div className="ph-stat-header">
              <span className="ph-stat-label">{hasRealDbHistory ? "Database Lowest" : "Tracking Start"}</span>
              <span className="ph-stat-icon">🎯</span>
            </div>
            <div className="ph-stat-value" style={{ color: "#34d399" }}>
              {formatINR(stats.allTimeLow)}
            </div>
            <div className="ph-stat-subtext">
              {hasRealDbHistory ? (
                <span>Lowest recorded in database</span>
              ) : (
                <span className="ph-badge-delta neutral">Logged on first discovery</span>
              )}
            </div>
          </div>

          {/* Database All-Time High / MRP */}
          <div className="ph-stat-card">
            <div className="ph-stat-header">
              <span className="ph-stat-label">{hasRealDbHistory ? "Database Peak" : "Listed MRP"}</span>
              <span className="ph-stat-icon">📈</span>
            </div>
            <div className="ph-stat-value">
              {hasRealDbHistory ? formatINR(stats.allTimeHigh) : formatINR(mrp || stats.currentLow)}
            </div>
            <div className="ph-stat-subtext">
              {mrp && stats.currentLow && mrp > stats.currentLow ? (
                <span className="ph-badge-delta green">
                  Save {formatINR(mrp - stats.currentLow)} off MRP
                </span>
              ) : (
                <span>Official retail benchmark</span>
              )}
            </div>
          </div>

          {/* Moving Average */}
          <div className="ph-stat-card">
            <div className="ph-stat-header">
              <span className="ph-stat-label">{hasRealDbHistory ? `${timeframe} Average` : "Market Status"}</span>
              <span className="ph-stat-icon">📊</span>
            </div>
            <div className="ph-stat-value">
              {hasRealDbHistory ? formatINR(stats.averagePrice) : "Active"}
            </div>
            <div className="ph-stat-subtext">
              {hasRealDbHistory ? (
                stats.diffFromAvg <= 0 ? (
                  <span className="ph-badge-delta green">{Math.abs(stats.dropPercent)}% below average</span>
                ) : (
                  <span className="ph-badge-delta red">{Math.abs(stats.dropPercent)}% above average</span>
                )
              ) : (
                <span>Ready for ongoing tracking</span>
              )}
            </div>
          </div>
        </section>

        {/* ─── Historical Chart OR Honest Day 1 Tracking Card ─── */}
        {hasRealDbHistory ? (
          <section className="ph-chart-panel">
            <div className="ph-chart-toolbar">
              <div className="ph-chart-title-area">
                <h3>Verified Price History Timeline</h3>
                <span>Authentic timestamped records pulled directly from SmartBuy's database</span>
              </div>

              <div className="ph-chart-controls">
                {/* Platform filters */}
                <div className="ph-platform-toggles">
                  <button
                    type="button"
                    className={`ph-platform-btn ${platformFilter === "both" ? "active" : ""}`}
                    onClick={() => setPlatformFilter("both")}
                  >
                    <span className="ph-dot both" /> Both
                  </button>
                  <button
                    type="button"
                    className={`ph-platform-btn ${platformFilter === "amazon" ? "active" : ""}`}
                    onClick={() => setPlatformFilter("amazon")}
                  >
                    <span className="ph-dot amazon" /> Amazon
                  </button>
                  <button
                    type="button"
                    className={`ph-platform-btn ${platformFilter === "flipkart" ? "active" : ""}`}
                    onClick={() => setPlatformFilter("flipkart")}
                  >
                    <span className="ph-dot flipkart" /> Flipkart
                  </button>
                </div>

                {/* Timeframe intervals */}
                <div className="ph-timeframe-selector">
                  {["30D", "90D", "180D", "ALL"].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      className={`ph-tf-btn ${timeframe === tf ? "active" : ""}`}
                      onClick={() => setTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SVG Canvas Area */}
            <div
              className="ph-svg-wrapper"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {chartBounds && (
                <svg
                  ref={svgRef}
                  className="ph-svg-chart"
                  viewBox={`0 0 ${chartBounds.width} ${chartBounds.height}`}
                  preserveAspectRatio="none"
                >
                  {/* Horizontal Gridlines */}
                  {chartBounds.ySteps.map((step, idx) => (
                    <g key={idx}>
                      <line
                        x1={chartBounds.padding.left}
                        y1={step.y}
                        x2={chartBounds.width - chartBounds.padding.right}
                        y2={step.y}
                        className="ph-grid-line"
                      />
                      <text
                        x={chartBounds.padding.left - 12}
                        y={step.y + 4}
                        textAnchor="end"
                        className="ph-axis-text"
                      >
                        {formatINR(step.price)}
                      </text>
                    </g>
                  ))}

                  {/* Benchmark Low Line */}
                  <line
                    x1={chartBounds.padding.left}
                    y1={chartBounds.getY(stats.allTimeLow)}
                    x2={chartBounds.width - chartBounds.padding.right}
                    y2={chartBounds.getY(stats.allTimeLow)}
                    className="ph-ref-line-low"
                  />
                  <text
                    x={chartBounds.width - chartBounds.padding.right - 8}
                    y={chartBounds.getY(stats.allTimeLow) - 6}
                    textAnchor="end"
                    className="ph-ref-label low"
                  >
                    Database Low ({formatINR(stats.allTimeLow)})
                  </text>

                  {/* Date X-Axis Labels */}
                  {filteredTimeline.length > 0 && (
                    <>
                      <text
                        x={chartBounds.padding.left}
                        y={chartBounds.height - 10}
                        textAnchor="start"
                        className="ph-axis-text"
                      >
                        {filteredTimeline[0].displayDate}
                      </text>
                      <text
                        x={chartBounds.width / 2}
                        y={chartBounds.height - 10}
                        textAnchor="middle"
                        className="ph-axis-text"
                      >
                        {filteredTimeline[Math.floor(filteredTimeline.length / 2)].displayDate}
                      </text>
                      <text
                        x={chartBounds.width - chartBounds.padding.right}
                        y={chartBounds.height - 10}
                        textAnchor="end"
                        className="ph-axis-text"
                      >
                        {filteredTimeline[filteredTimeline.length - 1].displayDate} (Latest)
                      </text>
                    </>
                  )}

                  {/* Flipkart Line */}
                  {(platformFilter === "both" || platformFilter === "flipkart") && (
                    <path d={chartBounds.flkPath} className="ph-line-flipkart" />
                  )}

                  {/* Amazon Line */}
                  {(platformFilter === "both" || platformFilter === "amazon") && (
                    <path d={chartBounds.amzPath} className="ph-line-amazon" />
                  )}

                  {/* Hover Crosshair */}
                  {hoverIndex !== null && activeHoverPoint && (
                    <g>
                      <line
                        x1={chartBounds.getX(hoverIndex)}
                        y1={chartBounds.padding.top}
                        x2={chartBounds.getX(hoverIndex)}
                        y2={chartBounds.height - chartBounds.padding.bottom}
                        className="ph-crosshair"
                      />
                      {activeHoverPoint.amazon && (platformFilter === "both" || platformFilter === "amazon") && (
                        <circle
                          cx={chartBounds.getX(hoverIndex)}
                          cy={chartBounds.getY(activeHoverPoint.amazon)}
                          r="6"
                          className="ph-point-marker amazon"
                        />
                      )}
                      {activeHoverPoint.flipkart && (platformFilter === "both" || platformFilter === "flipkart") && (
                        <circle
                          cx={chartBounds.getX(hoverIndex)}
                          cy={chartBounds.getY(activeHoverPoint.flipkart)}
                          r="6"
                          className="ph-point-marker flipkart"
                        />
                      )}
                    </g>
                  )}
                </svg>
              )}

              {/* Hover Tooltip */}
              {hoverIndex !== null && activeHoverPoint && (
                <div
                  className="ph-floating-tooltip"
                  style={{
                    left: `${hoverPos.x}px`,
                    top: `${hoverPos.y}px`,
                  }}
                >
                  <div className="ph-tt-date">{activeHoverPoint.displayDate}</div>
                  {activeHoverPoint.amazon && (
                    <div className="ph-tt-row">
                      <span className="ph-tt-platform">
                        <span className="ph-dot amazon" /> Amazon:
                      </span>
                      <span className="ph-tt-price">{formatINR(activeHoverPoint.amazon)}</span>
                    </div>
                  )}
                  {activeHoverPoint.flipkart && (
                    <div className="ph-tt-row">
                      <span className="ph-tt-platform">
                        <span className="ph-dot flipkart" /> Flipkart:
                      </span>
                      <span className="ph-tt-price">{formatINR(activeHoverPoint.flipkart)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Legends */}
            <div className="ph-chart-footer">
              <div className="ph-legends">
                <div className="ph-legend-item">
                  <span className="ph-legend-line amazon" /> Amazon Recorded Price
                </div>
                <div className="ph-legend-item">
                  <span className="ph-legend-line flipkart" /> Flipkart Recorded Price
                </div>
                <div className="ph-legend-item">
                  <span className="ph-legend-line low" /> Verified All-Time Low
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* Honest Day 1 Tracking Card for newly searched live products */
          <section className="ph-chart-panel ph-day1-panel" style={{ textAlign: "center", padding: "48px 32px" }}>
            <div style={{ maxWidth: "680px", margin: "0 auto" }}>
              <span style={{ fontSize: "42px", display: "block", marginBottom: "16px" }}>📡</span>
              <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#101828", marginBottom: "12px" }}>
                Live Product Discovery: Day 1 of Tracking
              </h3>
              <p style={{ color: "#667085", fontSize: "14px", lineHeight: "1.6", marginBottom: "28px" }}>
                This product was just discovered and compared live from Amazon & Flipkart. SmartBuy does not
                fabricate past dates. Click <strong>"Start Tracking This Product"</strong> below to save this item
                to the database and accumulate authentic daily price checkpoints.
              </p>

              <div
                style={{
                  display: "inline-flex",
                  gap: "24px",
                  background: "#f8fafc",
                  padding: "16px 28px",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "24px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <div>
                  <small style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase", fontWeight: "600" }}>
                    Amazon Live Price
                  </small>
                  <strong style={{ color: "#c2410c", fontSize: "18px" }}>{formatINR(amazonPrice)}</strong>
                </div>
                <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "24px" }}>
                  <small style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase", fontWeight: "600" }}>
                    Flipkart Live Price
                  </small>
                  <strong style={{ color: "#1d4ed8", fontSize: "18px" }}>{formatINR(flipkartPrice)}</strong>
                </div>
                {mrp && (
                  <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "24px" }}>
                    <small style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase", fontWeight: "600" }}>
                      Retail MRP
                    </small>
                    <strong style={{ color: "#94a3b8", fontSize: "18px" }}><del>{formatINR(mrp)}</del></strong>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ─── Price Drop Alert & Database Tracking Action ─── */}
        <section id="price-alert-section" className="ph-alert-card">
          <div className="ph-alert-text">
            <h3>Start Tracking & Set Price Alert</h3>
            <p>
              SmartBuy records daily price changes into the database. Enter a target price to receive price drop alerts.
            </p>

            <div className="ph-preset-row">
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>Quick presets:</span>
              <button
                type="button"
                className="ph-preset-btn"
                onClick={() => handlePresetAlert(5)}
              >
                -5% Drop ({formatINR(stats.currentLow * 0.95)})
              </button>
              <button
                type="button"
                className="ph-preset-btn"
                onClick={() => handlePresetAlert(10)}
              >
                -10% Drop ({formatINR(stats.currentLow * 0.9)})
              </button>
            </div>
          </div>

          <form className="ph-alert-input-wrap" onSubmit={handleSetAlert}>
            <div className="ph-input-field">
              <span className="ph-currency-symbol">₹</span>
              <input
                type="number"
                placeholder="Target Price"
                value={targetPriceInput}
                onChange={(e) => setTargetPriceInput(e.target.value)}
              />
            </div>
            <button type="submit" className="ph-submit-alert-btn" disabled={trackingLoading}>
              {trackingLoading ? "Saving..." : "Start Tracking & Set Alert"}
            </button>
          </form>

          {alertSuccessToast && (
            <div className="ph-alert-toast">
              {alertSuccessToast}
            </div>
          )}
        </section>

        {/* ─── Historical Breakdown Table (Only if Real DB History Exists) ─── */}
        {hasRealDbHistory && (
          <section className="ph-history-table-card">
            <div className="ph-table-header">
              <h3>Verified Database Price Checks</h3>
              <p>Chronological log of verified price checks recorded in MySQL</p>
            </div>

            <div className="ph-table-responsive">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Recorded Date</th>
                    <th>Amazon Price</th>
                    <th>Flipkart Price</th>
                    <th>Lowest Marketplace</th>
                    <th>Record Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimeline.slice().reverse().map((row, idx) => {
                    const amz = row.amazon;
                    const flk = row.flipkart;
                    const best = amz && flk ? (amz <= flk ? "Amazon" : "Flipkart") : (amz ? "Amazon" : "Flipkart");
                    const isLowestEver = row.lowest <= stats.allTimeLow;

                    return (
                      <tr key={idx}>
                        <td className="ph-table-date">{row.displayDate}</td>
                        <td className={`ph-price-cell ${best === "Amazon" ? "lowest" : ""}`}>
                          {formatINR(amz)}
                        </td>
                        <td className={`ph-price-cell ${best === "Flipkart" ? "lowest" : ""}`}>
                          {formatINR(flk)}
                        </td>
                        <td>
                          <strong style={{ color: best === "Amazon" ? "#fb923c" : "#60a5fa" }}>
                            {best}
                          </strong>
                        </td>
                        <td>
                          {isLowestEver ? (
                            <span className="ph-badge-delta green">Record Low</span>
                          ) : (
                            <span className="ph-badge-delta neutral">Recorded Check</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
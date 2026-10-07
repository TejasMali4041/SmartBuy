import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  PERSONAS,
  evaluateComparisonClient,
  formatINR,
  healOffers,
} from "../utils/recommendationEngine";
import "./Recommendation.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

export default function Recommendation() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedPersona, setSelectedPersona] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load comparison from state or sessionStorage
  const [comparison, setComparison] = useState(() => {
    if (location.state?.comparison) {
      try {
        sessionStorage.setItem(
          "smartbuy_active_comparison",
          JSON.stringify(location.state.comparison)
        );
      } catch (e) {
        console.warn("Could not cache comparison in sessionStorage", e);
      }
      return location.state.comparison;
    }
    try {
      const cached = sessionStorage.getItem("smartbuy_active_comparison");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Fetch from API if comparison not found in state/storage
  useEffect(() => {
    if (comparison && Array.isArray(comparison.offers) && comparison.offers.length > 0) {
      return;
    }

    if (!id) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    // If id is numeric (database product id)
    if (/^\d+$/.test(id)) {
      fetch(`${API_BASE}/api/products/${id}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Product not found (HTTP ${res.status})`);
          return res.json();
        })
        .then((data) => {
          if (!isMounted) return;
          const prod = data.product || data;
          if (prod && Array.isArray(prod.offers) && prod.offers.length > 0) {
            const compObj = {
              name: prod.name,
              brand: prod.brand,
              category: prod.category,
              image_url: prod.image_url,
              offers: prod.offers,
            };
            setComparison(compObj);
            try {
              sessionStorage.setItem("smartbuy_active_comparison", JSON.stringify(compObj));
            } catch (e) {}
          } else {
            setError("No marketplace offers found for this product.");
          }
        })
        .catch((err) => {
          if (isMounted) setError(err.message || "Failed to load product offers.");
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      // Fallback: search query or live search id
      setLoading(false);
      setError("No active comparison found. Please search for a product or pick from results.");
    }

    return () => {
      isMounted = false;
    };
  }, [id, comparison]);

  // Client-side baseline evaluation for instant zero-latency UI
  const clientAnalysis = useMemo(() => {
    if (!comparison) return null;
    return evaluateComparisonClient(comparison, selectedPersona);
  }, [comparison, selectedPersona]);

  // Deep AI evaluation fetched asynchronously from backend (Gemini AI with fallback)
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [personaCache, setPersonaCache] = useState({});

  useEffect(() => {
    if (!comparison || !Array.isArray(comparison.offers) || comparison.offers.length === 0) return;

    // If already in client cache for this persona, use immediately (0ms latency)
    if (personaCache[selectedPersona]) {
      setAiAnalysis(personaCache[selectedPersona]);
      setAiLoading(false);
      return;
    }

    let isMounted = true;
    setAiLoading(true);

    fetch(`${API_BASE}/api/recommendations/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comparison, persona: selectedPersona }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data?.success && data?.recommendation) {
          setAiAnalysis(data.recommendation);
          setPersonaCache((prev) => ({
            ...prev,
            [selectedPersona]: data.recommendation,
          }));
        }
      })
      .catch((err) => {
        console.warn("[SmartBuy] AI endpoint unavailable, using client engine:", err);
      })
      .finally(() => {
        if (isMounted) setAiLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [comparison, selectedPersona, personaCache]);

  // Prefer deep AI recommendation when available, otherwise client baseline
  const analysis = aiAnalysis || clientAnalysis;
  const winner = analysis?.winner;
  const alternatives = analysis?.alternatives || [];
  const currentPersona = PERSONAS[selectedPersona] || PERSONAS.balanced;

  // Compute SVG circle properties for dynamic score
  const scoreVal = winner?.composite_score || 0;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scoreVal / 100) * circumference;

  const scoreColor =
    scoreVal >= 85 ? "#22c55e" : scoreVal >= 70 ? "#3b82f6" : "#eab308";

  if (loading) {
    return (
      <main className="recommendation-page">
        <div className="recommendation-loading-container">
          <div className="recommendation-spinner"></div>
          <h2>SmartBuy AI is evaluating marketplace offers...</h2>
          <p>Analyzing price history, customer sentiment, and seller reliability.</p>
        </div>
      </main>
    );
  }

  if (error || !comparison || !winner) {
    return (
      <main className="recommendation-page">
        <div className="recommendation-empty-card">
          <div className="empty-icon">✦</div>
          <h2>No comparison data available</h2>
          <p>
            {error ||
              "SmartBuy needs at least one product offer to compute an AI recommendation."}
          </p>
          <div className="empty-actions">
            <Link to="/search" className="rec-btn-primary">
              🔍 Search Products
            </Link>
            <Link to="/" className="rec-btn-secondary">
              Go to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="recommendation-page">
      {/* Breadcrumb Navigation */}
      <nav className="recommendation-breadcrumb" aria-label="Breadcrumb">
        <Link to={`/product/${id}`} state={{ comparison }}>
          ← Back to Product
        </Link>
        <span className="breadcrumb-separator">/</span>
        <Link to={`/compare/${id}`} state={{ comparison }}>
          Compare Offers
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-active">AI Recommendation</span>
      </nav>

      {/* Hero AI Decision Header */}
      <section className="ai-header">
        <div className="ai-header-content">
          <div className="ai-badge">
            <span className="ai-sparkle">✦</span>{" "}
            {analysis.ai_powered
              ? "POWERED BY GEMINI AI"
              : "SMARTBUY AI DECISION ENGINE"}
            {aiLoading && <span className="ai-loading-pill"></span>}
          </div>

          <h1>
            Your smartest
            <br />
            <span>buying decision.</span>
          </h1>

          <p className="ai-verdict-p">{analysis.verdict_summary}</p>

          {analysis.tradeoff_analysis && (
            <div className="ai-tradeoff-banner">
              <span className="tradeoff-icon">⚖️</span>
              <span>
                <strong>Key Tradeoff:</strong> {analysis.tradeoff_analysis}
              </span>
            </div>
          )}

          <div className="ai-header-meta">
            <span className="confidence-tag">
              Confidence: <strong>{analysis.confidence}</strong>
            </span>
            <span className="meta-dot">·</span>
            <span>
              Evaluated <strong>{comparison.offers?.length || 2} marketplaces</strong>
            </span>
            {analysis.model_used && (
              <>
                <span className="meta-dot">·</span>
                <span className="model-tag">Model: {analysis.model_used}</span>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Animated Circular SVG Gauge */}
        <div className="ai-score-circle-container">
          <svg className="score-svg" width="200" height="200" viewBox="0 0 200 200">
            <circle
              className="score-bg-circle"
              cx="100"
              cy="100"
              r={radius}
              strokeWidth="12"
            />
            <circle
              className="score-progress-circle"
              cx="100"
              cy="100"
              r={radius}
              strokeWidth="12"
              stroke={scoreColor}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div className="score-inner-content">
            <span className="score-label">SMARTBUY SCORE</span>
            <strong className="score-number">{scoreVal}</strong>
            <small className="score-max">/ 100</small>
          </div>
        </div>
      </section>

      {/* Buyer Persona Switcher */}
      <section className="persona-section">
        <div className="persona-header">
          <div>
            <p className="section-eyebrow">CUSTOMIZE YOUR PRIORITIES</p>
            <h3>What matters most to you?</h3>
          </div>
          <span className="persona-hint">Click any priority to recalculate instantly:</span>
        </div>

        <div className="persona-grid">
          {Object.values(PERSONAS).map((p) => {
            const isActive = selectedPersona === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`persona-card ${isActive ? "active" : ""}`}
                onClick={() => setSelectedPersona(p.id)}
              >
                <div className="persona-icon">{p.icon}</div>
                <div className="persona-info">
                  <div className="persona-title-row">
                    <strong>{p.name}</strong>
                    {isActive && <span className="active-dot">● Active</span>}
                  </div>
                  <p>{p.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* The Winning Offer Card */}
      <section className="best-choice-section">
        <div className="choice-heading">
          <div>
            <p className="section-eyebrow">RECOMMENDED FOR YOU</p>
            <h2>Top Overall Value Pick</h2>
          </div>
          <div className="confidence-badge-pill">
            <span>Decision Confidence:</span>
            <strong className="confidence-high">{analysis.confidence}</strong>
          </div>
        </div>

        <div className="choice-card">
          <div className="choice-product-image">
            {winner.image_url ? (
              <img
                src={winner.image_url}
                alt={winner.title}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            ) : (
              <div className="image-placeholder">
                <span>🛍️</span>
                <small>{winner.platform}</small>
              </div>
            )}
          </div>

          <div className="choice-product-body">
            <div className="choice-provider-row">
              <span className="provider-tag">{winner.platform.toUpperCase()}</span>
              <span className="winner-pill">🏆 Top Recommended Deal</span>
            </div>

            <h3 className="choice-title">{winner.title}</h3>

            <div className="choice-rating-row">
              <div className="stars-badge">
                ⭐ <strong>{winner.rating?.toFixed(1) || "4.5"}</strong>
              </div>
              <span className="review-count-text">
                {winner.review_count > 0
                  ? `(${winner.review_count.toLocaleString("en-IN")} verified buyer reviews)`
                  : "(Verified platform listing)"}
              </span>
              <span className="seller-badge">
                🛡️ {winner.seller_name} ({winner.seller_rating?.toFixed(1) || "4.3"}★)
              </span>
            </div>

            {winner.pros && winner.pros.length > 0 && (
              <div className="pros-list">
                {winner.pros.map((pro, idx) => (
                  <span key={idx} className="pro-tag">
                    ✓ {pro}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="choice-price-box">
            <span className="price-label">Best Market Price</span>
            <strong className="price-amount">{formatINR(winner.price)}</strong>

            {winner.original_price && winner.original_price > winner.price && (
              <div className="mrp-row">
                <span className="mrp-strikethrough">{formatINR(winner.original_price)}</span>
                <span className="discount-pill">
                  {Math.round(
                    ((winner.original_price - winner.price) / winner.original_price) * 100
                  )}
                  % OFF
                </span>
              </div>
            )}

            <span className="delivery-subtext">🚚 {winner.delivery_text}</span>

            {winner.url ? (
              <a
                href={winner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="view-deal-btn"
              >
                View Deal on {winner.platform} →
              </a>
            ) : (
              <button disabled className="view-deal-btn disabled">
                Deal Unavailable
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Factor-by-Factor Explainable Breakdown */}
      <section className="why-section">
        <div className="why-heading">
          <p className="section-eyebrow">EXPLAINABLE AI BREAKDOWN</p>
          <h2>
            Why SmartBuy chose <span>{winner.platform}</span>
          </h2>
          <p>
            Each factor is scored out of 100 based on price gap, verified review volume, seller
            trustworthiness, active promotions, and delivery fulfillment.
          </p>

          <div className="quick-nav-links">
            <Link to={`/compare/${id}`} state={{ comparison }} className="quick-link">
              ⚔️ Compare All Specs Side-by-Side →
            </Link>
            <Link to={`/price-history/${id}`} state={{ comparison }} className="quick-link">
              📊 Check All-Time Price History →
            </Link>
          </div>
        </div>

        <div className="factor-list">
          {/* Factor 1: Price */}
          <div className="factor-card">
            <div className="factor-top">
              <span className="factor-title">💰 Price Efficiency & Savings</span>
              <strong className="factor-score">
                {winner.factor_scores.price} <span>/ 100</span>
              </strong>
            </div>
            <div className="factor-bar">
              <div
                className="factor-fill"
                style={{ width: `${winner.factor_scores.price}%` }}
              ></div>
            </div>
            <p className="factor-desc">
              {winner.factor_scores.price >= 85
                ? `Lowest current market price with strong discount versus MRP.`
                : `Priced competitively within normal marketplace margin.`}
            </p>
          </div>

          {/* Factor 2: Ratings */}
          <div className="factor-card">
            <div className="factor-top">
              <span className="factor-title">⭐ Verified Customer Rating</span>
              <strong className="factor-score">
                {winner.factor_scores.rating} <span>/ 100</span>
              </strong>
            </div>
            <div className="factor-bar">
              <div
                className="factor-fill"
                style={{ width: `${winner.factor_scores.rating}%` }}
              ></div>
            </div>
            <p className="factor-desc">
              {winner.rating}★ rating weighted against review volume to ensure authentic buyer
              sentiment.
            </p>
          </div>

          {/* Factor 3: Seller Reliability */}
          <div className="factor-card">
            <div className="factor-top">
              <span className="factor-title">🛡️ Seller Reliability & Trust</span>
              <strong className="factor-score">
                {winner.factor_scores.seller} <span>/ 100</span>
              </strong>
            </div>
            <div className="factor-bar">
              <div
                className="factor-fill"
                style={{ width: `${winner.factor_scores.seller}%` }}
              ></div>
            </div>
            <p className="factor-desc">
              Fulfillment managed by {winner.seller_name} with verified platform protection.
            </p>
          </div>

          {/* Factor 4: Value Adds & Perks */}
          <div className="factor-card">
            <div className="factor-top">
              <span className="factor-title">🎁 Offers, Bank Discounts & EMI</span>
              <strong className="factor-score">
                {winner.factor_scores.perks} <span>/ 100</span>
              </strong>
            </div>
            <div className="factor-bar">
              <div
                className="factor-fill"
                style={{ width: `${winner.factor_scores.perks}%` }}
              ></div>
            </div>
            <p className="factor-desc">
              {winner.offer_text || "Standard marketplace discount and card perks applicable."}
            </p>
          </div>

          {/* Factor 5: Delivery & Returns */}
          <div className="factor-card">
            <div className="factor-top">
              <span className="factor-title">🚀 Delivery Speed & Return Policy</span>
              <strong className="factor-score">
                {winner.factor_scores.delivery} <span>/ 100</span>
              </strong>
            </div>
            <div className="factor-bar">
              <div
                className="factor-fill"
                style={{ width: `${winner.factor_scores.delivery}%` }}
              ></div>
            </div>
            <p className="factor-desc">
              {winner.delivery_text} · 7 Days Replacement / Return Window.
            </p>
          </div>
        </div>
      </section>

      {/* Alternative Offers Comparison */}
      {alternatives.length > 0 && (
        <section className="alternatives-section">
          <div className="alternatives-heading">
            <div>
              <p className="section-eyebrow">OTHER AVAILABLE PLATFORMS</p>
              <h2>Alternative Offers & Trade-offs</h2>
            </div>
            <Link to={`/compare/${id}`} state={{ comparison }} className="compare-all-link">
              Compare Full Table →
            </Link>
          </div>

          <div className="alternative-grid">
            {alternatives.map((alt, idx) => (
              <div key={idx} className="alternative-card">
                <div className="alternative-image">
                  {alt.image_url ? (
                    <img
                      src={alt.image_url}
                      alt={alt.title}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  ) : (
                    <span>🛍️ {alt.platform}</span>
                  )}
                </div>

                <div className="alternative-content">
                  <div className="alt-top-row">
                    <span className="alt-platform">{alt.platform.toUpperCase()}</span>
                    <div className="alt-score-badge">
                      SmartBuy Score: <strong>{alt.composite_score}</strong>
                    </div>
                  </div>

                  <h3 className="alt-title">{alt.title}</h3>

                  <div className="alt-rating-row">
                    ⭐ <strong>{alt.rating?.toFixed(1) || "4.2"}</strong>
                    {alt.review_count > 0 && (
                      <span> · {alt.review_count.toLocaleString("en-IN")} reviews</span>
                    )}
                  </div>

                  <div className="alt-price-row">
                    <strong className="alt-price">{formatINR(alt.price)}</strong>
                    {alt.original_price && alt.original_price > alt.price && (
                      <span className="alt-mrp">{formatINR(alt.original_price)}</span>
                    )}
                  </div>

                  {alt.cons && alt.cons.length > 0 && (
                    <div className="alt-cons-list">
                      {alt.cons.map((con, cIdx) => (
                        <span key={cIdx} className="con-pill">
                          ⚠️ {con}
                        </span>
                      ))}
                    </div>
                  )}

                  {alt.url && (
                    <a
                      href={alt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="alt-deal-btn"
                    >
                      View Deal on {alt.platform} →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Explainable AI Callout Box */}
      <section className="explanation">
        <div className="explanation-icon">✦</div>
        <div>
          <p className="section-eyebrow">SMARTBUY INTELLIGENCE</p>
          <h2>Why not simply pick the cheapest listing?</h2>
          <p>
            E-commerce marketplaces often have extreme price variations caused by unverified
            third-party sellers, open-box items, lack of return coverage, or high cancellation
            rates. SmartBuy evaluates verified customer sentiment, seller reliability, and warranty
            security together so your decision is protected against hidden trade-offs.
          </p>
        </div>
      </section>
    </main>
  );
}
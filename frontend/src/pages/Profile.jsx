import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Profile.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return "₹" + Math.round(val).toLocaleString("en-IN");
}

function parsePrice(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "triggered" | "monitoring"
  const [toastMessage, setToastMessage] = useState("");

  // Inline editing target price state: { [productId]: targetPriceString }
  const [editingTarget, setEditingTarget] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 5000);
  };

  // Fetch alerts from remote DB watchlist + merge with local alerts
  const loadAlerts = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    let remoteItems = [];

    if (token) {
      try {
        const res = await fetch(`${API_BASE}/api/watchlist`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          remoteItems = (data.watchlist || []).map((item) => {
            const prod = item.product || {};
            const offers = prod.offers || [];
            const prices = offers.map((o) => parsePrice(o.price)).filter(Boolean);
            const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
            const bestOffer = offers.find((o) => parsePrice(o.price) === lowestPrice) || offers[0];

            return {
              id: item.id,
              product_id: prod.id,
              product_name: prod.name,
              brand: prod.brand,
              image_url: prod.image_url,
              target_price: item.target_price,
              current_price: lowestPrice,
              best_offer: bestOffer,
              offers: offers,
              created_at: item.created_at,
              is_remote: true,
            };
          });
        }
      } catch (err) {
        console.warn("Could not fetch remote watchlist:", err);
      }
    }

    // Merge with local storage alerts
    let localAlerts = [];
    try {
      localAlerts = JSON.parse(localStorage.getItem("smartbuy_local_alerts") || "[]").map((item) => {
        const offers = item.offers || [];
        const prices = offers.map((o) => parsePrice(o.price || o.sale_price)).filter(Boolean);
        const lowest = prices.length > 0 ? Math.min(...prices) : parsePrice(item.current_price);
        const best = offers.find((o) => parsePrice(o.price || o.sale_price) === lowest) || offers[0];

        return {
          id: item.id,
          product_id: item.product_id || item.id,
          product_name: item.product_name,
          brand: item.brand,
          image_url: item.image_url,
          target_price: item.target_price,
          current_price: lowest,
          best_offer: best,
          offers: offers,
          created_at: item.created_at,
          is_remote: false,
        };
      });
    } catch {
      localAlerts = [];
    }

    // Deduplicate by product name
    const combined = [...remoteItems];
    localAlerts.forEach((loc) => {
      const exists = combined.some(
        (rem) => rem.product_name.toLowerCase() === loc.product_name.toLowerCase()
      );
      if (!exists) {
        combined.push(loc);
      }
    });

    setAlerts(combined);
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  // Delete Alert
  const handleDeleteAlert = async (alertItem) => {
    const token = localStorage.getItem("token");

    // Remove from remote DB if registered
    if (token && alertItem.product_id && /^\d+$/.test(alertItem.product_id)) {
      try {
        await fetch(`${API_BASE}/api/watchlist/${alertItem.product_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn("Remote delete failed:", err);
      }
    }

    // Remove from local storage
    try {
      const localAlerts = JSON.parse(localStorage.getItem("smartbuy_local_alerts") || "[]");
      const updated = localAlerts.filter((a) => a.product_name !== alertItem.product_name);
      localStorage.setItem("smartbuy_local_alerts", JSON.stringify(updated));
    } catch (err) {
      console.warn("Local delete failed:", err);
    }

    setAlerts((prev) => prev.filter((a) => a.id !== alertItem.id));
    showToast(`Removed alert for "${alertItem.product_name.slice(0, 30)}..."`);
  };

  // Update Target Price
  const handleUpdateTarget = async (alertItem, newTarget) => {
    const val = parseFloat(newTarget);
    if (!val || val <= 0) return;

    const token = localStorage.getItem("token");

    // Update in remote DB
    if (token && alertItem.product_id && /^\d+$/.test(alertItem.product_id)) {
      try {
        await fetch(`${API_BASE}/api/watchlist/${alertItem.product_id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ target_price: val }),
        });
      } catch (err) {
        console.warn("Remote update failed:", err);
      }
    }

    // Update in local storage
    try {
      const localAlerts = JSON.parse(localStorage.getItem("smartbuy_local_alerts") || "[]");
      const updated = localAlerts.map((a) =>
        a.product_name === alertItem.product_name ? { ...a, target_price: val } : a
      );
      localStorage.setItem("smartbuy_local_alerts", JSON.stringify(updated));
    } catch (err) {
      console.warn("Local update failed:", err);
    }

    setAlerts((prev) =>
      prev.map((a) => (a.id === alertItem.id ? { ...a, target_price: val } : a))
    );

    setEditingTarget((prev) => ({ ...prev, [alertItem.id]: "" }));
    showToast(`Updated target price to ₹${val.toLocaleString("en-IN")}`);
  };

  // Analytics
  const stats = useMemo(() => {
    const total = alerts.length;
    let triggeredCount = 0;
    let totalSavings = 0;

    alerts.forEach((a) => {
      if (a.target_price && a.current_price && a.current_price <= a.target_price) {
        triggeredCount++;
        totalSavings += a.target_price - a.current_price;
      }
    });

    return {
      total,
      triggeredCount,
      monitoringCount: total - triggeredCount,
      totalSavings: Math.round(totalSavings),
    };
  }, [alerts]);

  // Tab Filtering
  const filteredAlerts = useMemo(() => {
    if (activeTab === "triggered") {
      return alerts.filter(
        (a) => a.target_price && a.current_price && a.current_price <= a.target_price
      );
    }
    if (activeTab === "monitoring") {
      return alerts.filter(
        (a) => !a.target_price || !a.current_price || a.current_price > a.target_price
      );
    }
    return alerts;
  }, [alerts, activeTab]);

  return (
    <main className="profile-page">
      <div className="profile-container">
        {/* ─── Profile Header ─── */}
        <section className="profile-header-card">
          <div className="profile-user-left">
            <div className="profile-avatar-badge">
              {user?.name ? user.name.charAt(0).toUpperCase() : "👤"}
            </div>
            <div className="profile-user-info">
              <h1>{user?.name || "SmartBuy Shopper"}</h1>
              <p>{user?.email || "Personal Price Alerts & Watchlist Center"}</p>
            </div>
          </div>

          <div className="profile-header-actions">
            {user ? (
              <button
                type="button"
                className="profile-logout-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="profile-btn-deal">
                Sign In to Sync Across Devices →
              </Link>
            )}
          </div>
        </section>

        {/* ─── Summary Counter Bar ─── */}
        <section className="profile-stats-grid">
          <div className="profile-stat-tile">
            <div className="profile-stat-icon blue">🔔</div>
            <div className="profile-stat-meta">
              <span>Active Alerts</span>
              <strong>{stats.total} Products</strong>
            </div>
          </div>

          <div className="profile-stat-tile">
            <div className="profile-stat-icon green">🎯</div>
            <div className="profile-stat-meta">
              <span>Target Met / Deals</span>
              <strong style={{ color: "#34d399" }}>{stats.triggeredCount} Deals Ready</strong>
            </div>
          </div>

          <div className="profile-stat-tile">
            <div className="profile-stat-icon amber">💰</div>
            <div className="profile-stat-meta">
              <span>Extra Savings Won</span>
              <strong>{formatINR(stats.totalSavings)}</strong>
            </div>
          </div>
        </section>

        {/* ─── Watchlist & Price Alerts List ─── */}
        <section className="profile-watchlist-section">
          <div className="profile-section-bar">
            <h2>
              <span>🎯</span> Price Drop Alerts & Watchlist
            </h2>

            <div className="profile-tabs">
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All ({alerts.length})
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === "triggered" ? "active" : ""}`}
                onClick={() => setActiveTab("triggered")}
              >
                Deals Met ({stats.triggeredCount})
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === "monitoring" ? "active" : ""}`}
                onClick={() => setActiveTab("monitoring")}
              >
                Monitoring ({stats.monitoringCount})
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
              Loading your active price alerts…
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="profile-empty-alerts">
              <span className="profile-empty-icon">🏷️</span>
              <h3>No alerts found in this view</h3>
              <p>
                {activeTab === "triggered"
                  ? "None of your tracked products have dropped below your target price yet. We are actively monitoring them 24/7!"
                  : "You haven't set any price drop alerts yet. Search any product and click 'Set Alert' to begin tracking."}
              </p>
              <Link to="/search" className="profile-btn-search">
                🔍 Search Products to Track
              </Link>
            </div>
          ) : (
            <div className="profile-alerts-list">
              {filteredAlerts.map((item) => {
                const isTriggered =
                  item.target_price &&
                  item.current_price &&
                  item.current_price <= item.target_price;
                const savingsExtra = isTriggered ? item.target_price - item.current_price : 0;
                const diffToDrop =
                  !isTriggered && item.target_price && item.current_price
                    ? item.current_price - item.target_price
                    : 0;

                const bestPlatform =
                  item.best_offer?.platform ||
                  (item.offers && item.offers[0]?.platform) ||
                  "Marketplace";
                const dealUrl = item.best_offer?.url || item.best_offer?.product_url;

                return (
                  <article
                    key={item.id}
                    className={`profile-alert-card ${isTriggered ? "triggered" : ""}`}
                  >
                    {/* Top row */}
                    <div className="profile-alert-top">
                      <div className="profile-alert-product">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="profile-product-img"
                          />
                        ) : (
                          <div className="profile-product-img-fallback">📦</div>
                        )}

                        <div className="profile-product-title-wrap">
                          {item.brand && (
                            <span className="profile-product-brand">{item.brand}</span>
                          )}
                          <h3>{item.product_name}</h3>
                          <span className="profile-alert-dates">
                            Tracked since {new Date(item.created_at || Date.now()).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      </div>

                      {/* Pricing pills */}
                      <div className="profile-alert-prices">
                        <div className="profile-price-col">
                          <span>Current Best</span>
                          <strong className="current">
                            {formatINR(item.current_price)}{" "}
                            <small style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "normal" }}>
                              on {bestPlatform}
                            </small>
                          </strong>
                        </div>

                        <div className="profile-price-col">
                          <span>Your Target Alert</span>
                          <strong className="target">
                            {item.target_price ? formatINR(item.target_price) : "Any drop"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Alert Status Banner */}
                    {isTriggered ? (
                      <div className="profile-alert-banner triggered">
                        <span>
                          🎉 <strong>TARGET PRICE REACHED!</strong> Price has dropped to{" "}
                          {formatINR(item.current_price)} on {bestPlatform}. You save an extra{" "}
                          {formatINR(savingsExtra)} below your target!
                        </span>
                        {dealUrl && (
                          <a
                            href={dealUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="profile-btn-deal"
                          >
                            Buy Deal on {bestPlatform} ↗
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="profile-alert-banner monitoring">
                        <span>
                          ⏳ <strong>Actively Monitoring:</strong> Current price is{" "}
                          {formatINR(item.current_price)}. Needs a drop of{" "}
                          <strong>{formatINR(diffToDrop)}</strong> to reach your target of{" "}
                          {formatINR(item.target_price)}.
                        </span>
                      </div>
                    )}

                    {/* Actions bar */}
                    <div className="profile-alert-actions">
                      <div className="profile-actions-left">
                        <Link
                          to={`/price-history/${item.product_id}`}
                          state={{ comparison: { name: item.product_name, offers: item.offers } }}
                          className="profile-btn-history"
                        >
                          📊 View Price Trend & History →
                        </Link>
                      </div>

                      <div className="profile-actions-right">
                        {/* Inline Target Price Editor */}
                        <form
                          className="profile-edit-target-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleUpdateTarget(item, editingTarget[item.id]);
                          }}
                        >
                          <input
                            type="number"
                            placeholder="New Target"
                            className="profile-edit-input"
                            value={
                              editingTarget[item.id] !== undefined
                                ? editingTarget[item.id]
                                : ""
                            }
                            onChange={(e) =>
                              setEditingTarget({
                                ...editingTarget,
                                [item.id]: e.target.value,
                              })
                            }
                          />
                          <button type="submit" className="profile-btn-save">
                            Update
                          </button>
                        </form>

                        <button
                          type="button"
                          className="profile-btn-delete"
                          onClick={() => handleDeleteAlert(item)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {toastMessage && (
        <div className="profile-toast">
          <span>✓</span> {toastMessage}
        </div>
      )}
    </main>
  );
}
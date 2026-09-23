import { Link, useLocation, useNavigate } from "react-router-dom";
import "./ProtectedRoute.css";

export default function ProtectedRoute({ children, feature = "This Feature" }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Check if authenticated (user and/or token)
  const isAuth = Boolean(
    localStorage.getItem("user") || localStorage.getItem("token")
  );

  if (isAuth) {
    return children;
  }

  const getFeatureDetails = () => {
    switch (feature.toLowerCase()) {
      case "price history":
        return {
          title: "Price History & Trend Tracker",
          desc: "Sign in to unlock verified historical price charts, all-time lows, moving averages, and 24/7 price drop alerts.",
          benefits: [
            "Track historical price drops across Amazon & Flipkart",
            "Real-time alerts when prices hit your custom target",
            "Smart Buy verdict (Buy Now vs Wait for Sale)",
          ],
        };
      case "ai recommendations":
        return {
          title: "SmartBuy AI Recommendation",
          desc: "Sign in to unlock personalized AI recommendation scoring, seller trust analysis, and confidence weights.",
          benefits: [
            "Multi-factor algorithmic product evaluation",
            "Seller reputation and delivery speed breakdown",
            "Interactive weighting tailored to your buying preferences",
          ],
        };
      case "watchlist & price alerts":
      case "profile":
        return {
          title: "Personal Watchlist & Alert Center",
          desc: "Sign in to manage your active price alerts, monitored products, and deal triggers securely across devices.",
          benefits: [
            "24/7 background price monitoring",
            "Instant notifications when products drop below target",
            "Sync your saved deals across all your devices",
          ],
        };
      case "review analysis":
        return {
          title: "AI Review & Sentiment Breakdown",
          desc: "Sign in to view AI-extracted pros & cons, feature-by-feature sentiment breakdown, and fake review shield.",
          benefits: [
            "Aspect-based sentiment analysis (battery, build, camera)",
            "Automated verified buyer pros & cons summary",
            "Review authenticity & fake review detection",
          ],
        };
      default:
        return {
          title: feature,
          desc: "Sign in to unlock premium shopping intelligence tools and saved alerts.",
          benefits: [
            "Personalized shopping analysis",
            "24/7 automated price drop alerts",
            "Verified historical data and insights",
          ],
        };
    }
  };

  const details = getFeatureDetails();

  return (
    <main className="protected-gate-page">
      <div className="protected-gate-card">
        <div className="protected-lock-icon-wrap">🔒</div>
        <span className="protected-gate-badge">SmartBuy Account Required</span>

        <h1>{details.title}</h1>
        <p className="protected-gate-desc">{details.desc}</p>

        <div className="protected-benefits-list">
          {details.benefits.map((b, i) => (
            <div key={i} className="protected-benefit-item">
              <span>✓</span>
              <span>{b}</span>
            </div>
          ))}
        </div>

        <div className="protected-gate-actions">
          <Link
            to="/login"
            state={{ from: location.pathname, forwardState: location.state }}
            className="protected-btn-login"
          >
            Sign In to Unlock →
          </Link>

          <Link
            to="/register"
            state={{ from: location.pathname, forwardState: location.state }}
            className="protected-btn-register"
          >
            Create Free Account
          </Link>

          <button
            type="button"
            className="protected-back-link"
            onClick={() => navigate(-1)}
          >
            ← Back to Free Comparison & Details
          </button>
        </div>
      </div>
    </main>
  );
}

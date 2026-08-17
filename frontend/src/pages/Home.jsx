import { Link } from "react-router-dom";
import "./Home.css";

function Home() {
  return (
    <main className="home">

      {/* Hero */}
      <section className="hero">

        <div className="hero-content">

          <div className="hero-badge">
            ✦ AI-powered shopping intelligence
          </div>

          <h1>
            Shop smarter.
            <br />
            <span>Buy with confidence.</span>
          </h1>

          <p className="hero-description">
            Compare prices, ratings, reviews and sellers across
            multiple e-commerce platforms — all in one place.
          </p>

          <div className="hero-search">
            <span className="search-icon">⌕</span>

            <input
              type="text"
              placeholder="Search for products..."
            />

            <button>Search</button>
          </div>

          <div className="popular-searches">
            <span>Popular:</span>

            <Link to="/search?q=iphone">iPhone</Link>
            <Link to="/search?q=laptop">Laptops</Link>
            <Link to="/search?q=headphones">Headphones</Link>
            <Link to="/search?q=smartwatch">Smartwatches</Link>
          </div>

        </div>

        <div className="hero-visual">

          <div className="floating-card price-card">

            <div className="card-icon">₹</div>

            <div>
              <small>Best price found</small>
              <strong>₹69,999</strong>
            </div>

            <span className="positive">↓ 12%</span>

          </div>

          <div className="product-orbit">

            <div className="orbit-ring"></div>

            <div className="product-placeholder">
              <div className="product-glow"></div>
              <span>SmartBuy</span>
            </div>

          </div>

          <div className="floating-card ai-card">

            <div className="ai-icon">✦</div>

            <div>
              <small>SmartBuy AI</small>
              <strong>94 / 100</strong>
            </div>

            <span className="ai-label">Best choice</span>

          </div>

        </div>

      </section>

      {/* Providers */}
      <section className="providers-section">

        <p className="section-eyebrow">
          COMPARE ACROSS PLATFORMS
        </p>

        <h2>
          One search. Multiple stores.
        </h2>

        <div className="provider-list">

          <div className="provider amazon">
            <span className="provider-mark">a</span>
            <span>Amazon</span>
          </div>

          <div className="provider flipkart">
            <span className="provider-mark">F</span>
            <span>Flipkart</span>
          </div>

          <div className="provider meesho">
            <span className="provider-mark">M</span>
            <span>Meesho</span>
          </div>

          <div className="provider myntra">
            <span className="provider-mark">M</span>
            <span>Myntra</span>
          </div>

        </div>

      </section>

      {/* Features */}
      <section className="features-section">

        <div className="section-heading">
          <div>
            <p className="section-eyebrow">WHY SMARTBUY</p>

            <h2>
              More than just
              <span> price comparison.</span>
            </h2>
          </div>

          <p>
            SmartBuy brings the information you need to make
            a confident purchase decision.
          </p>
        </div>

        <div className="feature-grid">

          <div className="feature-card feature-large">

            <div className="feature-number">01</div>

            <div className="feature-icon">↔</div>

            <h3>Compare everything</h3>

            <p>
              See prices, ratings, sellers, delivery and offers
              side-by-side across different platforms.
            </p>

            <Link to="/search">
              Explore comparison →
            </Link>

          </div>

          <div className="feature-card">

            <div className="feature-number">02</div>

            <div className="feature-icon">✦</div>

            <h3>Smart recommendations</h3>

            <p>
              Get a recommendation based on multiple purchase
              factors instead of price alone.
            </p>

          </div>

          <div className="feature-card">

            <div className="feature-number">03</div>

            <div className="feature-icon">◷</div>

            <h3>Track price history</h3>

            <p>
              Understand whether today's price is actually
              worth buying.
            </p>

          </div>

          <div className="feature-card feature-wide">

            <div className="feature-number">04</div>

            <div className="feature-icon">◉</div>

            <h3>Understand reviews</h3>

            <p>
              Analyze customer feedback and discover what buyers
              actually think about a product.
            </p>

          </div>

        </div>

      </section>

      {/* CTA */}
      <section className="cta-section">

        <div>
          <p className="section-eyebrow">READY TO SHOP?</p>

          <h2>
            Find your next
            <br />
            <span>best deal.</span>
          </h2>
        </div>

        <Link to="/search" className="cta-button">
          Start searching →
        </Link>

      </section>

    </main>
  );
}

export default Home;
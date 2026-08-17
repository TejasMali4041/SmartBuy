import { Link, useParams } from "react-router-dom";
import "./ProductDetails.css";

function ProductDetails() {
  const { id } = useParams();

  return (
    <main className="product-page">

      <div className="product-breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/search">Search</Link>
        <span>/</span>
        <span>Product</span>
      </div>

      {/* Product Overview */}
      <section className="product-overview">

        <div className="product-image-area">
          <div className="product-image">
            <span>Product Image</span>
          </div>

          <div className="image-dots">
            <span className="active"></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>

        <div className="product-information">

          <div className="product-tag">
            BEST MATCH
          </div>

          <h1>Product Name Will Appear Here</h1>

          <p className="product-brand">
            Brand • Product Category
          </p>

          <div className="product-rating-row">

            <div className="rating">
              ⭐ <strong>4.5</strong>
            </div>

            <span>12,500 reviews</span>

            <span className="rating-divider">•</span>

            <span>Verified product</span>

          </div>

          <p className="product-description">
            Product description and specifications will be
            provided by the SmartBuy backend.
          </p>

          <div className="quick-specs">

            <div>
              <span>Processor</span>
              <strong>—</strong>
            </div>

            <div>
              <span>RAM</span>
              <strong>—</strong>
            </div>

            <div>
              <span>Storage</span>
              <strong>—</strong>
            </div>

            <div>
              <span>Display</span>
              <strong>—</strong>
            </div>

          </div>

        </div>

      </section>

      {/* Price Summary */}
      <section className="price-summary">

        <div className="price-heading">

          <div>
            <p className="section-eyebrow">
              BEST CURRENT PRICE
            </p>

            <h2>Compare before you buy</h2>
          </div>

          <div className="lowest-price">

            <small>Lowest price</small>

            <strong>₹--</strong>

            <span>Across available stores</span>

          </div>

        </div>

        {/* Offers */}
        <div className="offer-list">

          <div className="offer-row recommended">

            <div className="offer-provider">
              <div className="provider-logo">A</div>

              <div>
                <strong>Amazon</strong>
                <span>Trusted seller</span>
              </div>
            </div>

            <div className="offer-rating">
              ⭐ 4.5
            </div>

            <div className="offer-price">
              <small>Price</small>
              <strong>₹--</strong>
            </div>

            <div className="offer-delivery">
              <span>✓</span>
              Free delivery
            </div>

            <button className="deal-link">
              View Deal →
            </button>

          </div>

          <div className="offer-row">

            <div className="offer-provider">
              <div className="provider-logo">F</div>

              <div>
                <strong>Flipkart</strong>
                <span>Trusted seller</span>
              </div>
            </div>

            <div className="offer-rating">
              ⭐ 4.4
            </div>

            <div className="offer-price">
              <small>Price</small>
              <strong>₹--</strong>
            </div>

            <div className="offer-delivery">
              <span>✓</span>
              Free delivery
            </div>

            <button className="deal-link">
              View Deal →
            </button>

          </div>

          <div className="offer-row">

            <div className="offer-provider">
              <div className="provider-logo">M</div>

              <div>
                <strong>Meesho</strong>
                <span>Available offer</span>
              </div>
            </div>

            <div className="offer-rating">
              ⭐ 4.2
            </div>

            <div className="offer-price">
              <small>Price</small>
              <strong>₹--</strong>
            </div>

            <div className="offer-delivery">
              <span>✓</span>
              Delivery available
            </div>

            <button className="deal-link">
              View Deal →
            </button>

          </div>

        </div>

        <div className="comparison-actions">

          <Link
            to={`/compare/${id}`}
            className="compare-main-button"
          >
            Compare All Offers
            <span>→</span>
          </Link>

          <Link
            to={`/recommendation/${id}`}
            className="recommend-main-button"
          >
            ✦ Get Smart Recommendation
          </Link>

        </div>

      </section>

      {/* Lower Information */}
      <section className="product-lower">

        <div className="specification-panel">

          <div className="panel-header">
            <div>
              <p className="section-eyebrow">PRODUCT DETAILS</p>
              <h2>Specifications</h2>
            </div>
          </div>

          <div className="spec-grid">

            <div className="spec-item">
              <span>Brand</span>
              <strong>—</strong>
            </div>

            <div className="spec-item">
              <span>Model</span>
              <strong>—</strong>
            </div>

            <div className="spec-item">
              <span>Processor</span>
              <strong>—</strong>
            </div>

            <div className="spec-item">
              <span>Graphics</span>
              <strong>—</strong>
            </div>

            <div className="spec-item">
              <span>Memory</span>
              <strong>—</strong>
            </div>

            <div className="spec-item">
              <span>Storage</span>
              <strong>—</strong>
            </div>

          </div>

        </div>

        <div className="analysis-panel">

          <p className="section-eyebrow">SMARTBUY ANALYSIS</p>

          <h2>Understand before you buy.</h2>

          <p>
            Explore price trends and customer feedback to make
            a more informed decision.
          </p>

          <div className="analysis-links">

            <Link to={`/price-history/${id}`}>
              <span>◷</span>
              <div>
                <strong>Price History</strong>
                <small>Check historical prices →</small>
              </div>
            </Link>

            <Link to={`/reviews/${id}`}>
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
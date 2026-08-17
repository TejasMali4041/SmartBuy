import { Link, useParams } from "react-router-dom";
import "./Compare.css";

function Compare() {
  const { id } = useParams();

  return (
    <main className="compare-page">

      <div className="compare-breadcrumb">
        <Link to={`/product/${id}`}>← Back to Product</Link>
      </div>

      {/* Header */}
      <section className="compare-header">

        <div>
          <p className="section-eyebrow">SMARTBUY COMPARISON</p>

          <h1>Compare all offers</h1>

          <p>
            Find the best combination of price, seller,
            delivery and overall value.
          </p>
        </div>

        <div className="compare-product">
          <div className="mini-product-image">
            Product
          </div>

          <div>
            <strong>Product Name</strong>
            <span>Multiple offers available</span>
          </div>
        </div>

      </section>

      {/* Summary */}
      <section className="comparison-summary">

        <div className="summary-card best">

          <span className="summary-icon">🏆</span>

          <div>
            <small>Best Overall</small>
            <strong>—</strong>
            <p>SmartBuy Score</p>
          </div>

        </div>

        <div className="summary-card">

          <span className="summary-icon">₹</span>

          <div>
            <small>Lowest Price</small>
            <strong>₹--</strong>
            <p>Best available deal</p>
          </div>

        </div>

        <div className="summary-card">

          <span className="summary-icon">⭐</span>

          <div>
            <small>Highest Rated</small>
            <strong>—</strong>
            <p>Based on ratings</p>
          </div>

        </div>

        <div className="summary-card">

          <span className="summary-icon">🚚</span>

          <div>
            <small>Best Delivery</small>
            <strong>—</strong>
            <p>Fastest available</p>
          </div>

        </div>

      </section>

      {/* Comparison Table */}
      <section className="offers-section">

        <div className="offers-title">

          <div>
            <h2>Available offers</h2>
            <p>
              Compare the details before choosing where to buy.
            </p>
          </div>

          <select defaultValue="overall">
            <option value="overall">Best Overall</option>
            <option value="price">Lowest Price</option>
            <option value="rating">Highest Rating</option>
            <option value="delivery">Fastest Delivery</option>
          </select>

        </div>

        <div className="offers-table">

          {/* Table Header */}
          <div className="table-header">
            <span>Store</span>
            <span>Price</span>
            <span>Rating</span>
            <span>Delivery</span>
            <span>Seller</span>
            <span></span>
          </div>

          {/* Amazon */}
          <div className="offer-card recommended">

            <div className="store-info">

              <div className="store-logo amazon-logo">
                A
              </div>

              <div>
                <strong>Amazon</strong>
                <span>Recommended</span>
              </div>

            </div>

            <div className="table-price">
              <strong>₹--</strong>
              <span>Lowest price</span>
            </div>

            <div className="table-rating">
              ⭐ <strong>4.5</strong>
              <span>12.5K reviews</span>
            </div>

            <div className="table-delivery">
              <strong>—</strong>
              <span>Delivery</span>
            </div>

            <div className="table-seller">
              <strong>—</strong>
              <span>Seller rating</span>
            </div>

            <button className="deal-button">
              View Deal →
            </button>

          </div>

          {/* Flipkart */}
          <div className="offer-card">

            <div className="store-info">

              <div className="store-logo flipkart-logo">
                F
              </div>

              <div>
                <strong>Flipkart</strong>
                <span>Available</span>
              </div>

            </div>

            <div className="table-price">
              <strong>₹--</strong>
              <span>Price</span>
            </div>

            <div className="table-rating">
              ⭐ <strong>4.4</strong>
              <span>9.8K reviews</span>
            </div>

            <div className="table-delivery">
              <strong>—</strong>
              <span>Delivery</span>
            </div>

            <div className="table-seller">
              <strong>—</strong>
              <span>Seller rating</span>
            </div>

            <button className="deal-button">
              View Deal →
            </button>

          </div>

          {/* Meesho */}
          <div className="offer-card">

            <div className="store-info">

              <div className="store-logo meesho-logo">
                M
              </div>

              <div>
                <strong>Meesho</strong>
                <span>Available</span>
              </div>

            </div>

            <div className="table-price">
              <strong>₹--</strong>
              <span>Price</span>
            </div>

            <div className="table-rating">
              ⭐ <strong>4.2</strong>
              <span>5.4K reviews</span>
            </div>

            <div className="table-delivery">
              <strong>—</strong>
              <span>Delivery</span>
            </div>

            <div className="table-seller">
              <strong>—</strong>
              <span>Seller rating</span>
            </div>

            <button className="deal-button">
              View Deal →
            </button>

          </div>

        </div>

      </section>

      {/* SmartBuy Analysis */}
      <section className="compare-analysis">

        <div className="analysis-copy">

          <p className="section-eyebrow">
            SMARTBUY ANALYSIS
          </p>

          <h2>
            The cheapest offer isn't
            <span> always the best.</span>
          </h2>

          <p>
            SmartBuy evaluates multiple factors so you can
            understand the difference between price and
            actual value.
          </p>

        </div>

        <div className="score-breakdown">

          <div className="score-row">
            <span>Price</span>
            <div className="score-bar">
              <div style={{ width: "88%" }}></div>
            </div>
            <strong>88</strong>
          </div>

          <div className="score-row">
            <span>Rating</span>
            <div className="score-bar">
              <div style={{ width: "92%" }}></div>
            </div>
            <strong>92</strong>
          </div>

          <div className="score-row">
            <span>Reviews</span>
            <div className="score-bar">
              <div style={{ width: "84%" }}></div>
            </div>
            <strong>84</strong>
          </div>

          <div className="score-row">
            <span>Seller</span>
            <div className="score-bar">
              <div style={{ width: "90%" }}></div>
            </div>
            <strong>90</strong>
          </div>

          <div className="score-row">
            <span>Delivery</span>
            <div className="score-bar">
              <div style={{ width: "78%" }}></div>
            </div>
            <strong>78</strong>
          </div>

        </div>

      </section>

      {/* CTA */}
      <section className="compare-cta">

        <div>
          <h2>Want SmartBuy to choose for you?</h2>

          <p>
            Get a personalized recommendation based on
            multiple purchase factors.
          </p>
        </div>

        <Link
          to={`/recommendation/${id}`}
          className="recommend-button"
        >
          ✦ Get Smart Recommendation
        </Link>

      </section>

    </main>
  );
}

export default Compare;
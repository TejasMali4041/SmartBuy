import { Link, useParams } from "react-router-dom";
import "./Recommendation.css";

function Recommendation() {
  const { id } = useParams();

  return (
    <main className="recommendation-page">

      <div className="recommendation-breadcrumb">
        <Link to={`/product/${id}`}>← Back to Product</Link>
      </div>

      {/* AI Header */}
      <section className="ai-header">

        <div className="ai-header-content">

          <div className="ai-badge">
            ✦ SMARTBUY AI
          </div>

          <h1>
            Your smartest
            <br />
            <span>buying decision.</span>
          </h1>

          <p>
            SmartBuy evaluates price, ratings, reviews, seller
            reliability and delivery to help you choose the
            best offer.
          </p>

        </div>

        <div className="ai-score-circle">

          <div className="score-inner">
            <span>Overall</span>
            <strong>94</strong>
            <small>/ 100</small>
          </div>

        </div>

      </section>

      {/* Recommendation */}
      <section className="best-choice">

        <div className="choice-heading">

          <div>
            <p className="section-eyebrow">
              RECOMMENDED FOR YOU
            </p>

            <h2>Best overall choice</h2>
          </div>

          <div className="confidence">
            <span>Confidence</span>
            <strong>High</strong>
          </div>

        </div>

        <div className="choice-card">

          <div className="choice-product-image">
            Product
          </div>

          <div className="choice-product">

            <div className="choice-provider">
              <span>FLIPKART</span>
              <strong>Recommended offer</strong>
            </div>

            <h3>Product Name</h3>

            <div className="choice-rating">
              ⭐ <strong>4.5</strong>
              <span>12,500 reviews</span>
            </div>

            <p>
              This offer provides the strongest overall
              combination of price, seller reliability,
              ratings and customer feedback.
            </p>

          </div>

          <div className="choice-price">

            <span>Best price</span>

            <strong>₹--</strong>

            <small>Available offer</small>

            <button>
              View Deal →
            </button>

          </div>

        </div>

      </section>

      {/* Why Recommendation */}
      <section className="why-section">

        <div className="why-heading">

          <p className="section-eyebrow">
            WHY THIS OFFER?
          </p>

          <h2>
            SmartBuy looked at
            <span> more than price.</span>
          </h2>

          <p>
            Each factor contributes to the final recommendation
            score. The actual weights will eventually be
            personalized using your SmartBuy preferences.
          </p>

        </div>

        <div className="factor-list">

          <div className="factor">

            <div className="factor-top">
              <span>Price</span>
              <strong>30 / 30</strong>
            </div>

            <div className="factor-bar">
              <div style={{ width: "100%" }}></div>
            </div>

            <p>
              Strong price compared with other available offers.
            </p>

          </div>

          <div className="factor">

            <div className="factor-top">
              <span>Rating</span>
              <strong>14 / 15</strong>
            </div>

            <div className="factor-bar">
              <div style={{ width: "93%" }}></div>
            </div>

            <p>
              High average customer rating.
            </p>

          </div>

          <div className="factor">

            <div className="factor-top">
              <span>Reviews</span>
              <strong>13 / 15</strong>
            </div>

            <div className="factor-bar">
              <div style={{ width: "87%" }}></div>
            </div>

            <p>
              Strong review volume and positive customer feedback.
            </p>

          </div>

          <div className="factor">

            <div className="factor-top">
              <span>Seller</span>
              <strong>14 / 15</strong>
            </div>

            <div className="factor-bar">
              <div style={{ width: "93%" }}></div>
            </div>

            <p>
              Reliable seller with a strong seller rating.
            </p>

          </div>

          <div className="factor">

            <div className="factor-top">
              <span>Delivery</span>
              <strong>12 / 15</strong>
            </div>

            <div className="factor-bar">
              <div style={{ width: "80%" }}></div>
            </div>

            <p>
              Competitive delivery availability and speed.
            </p>

          </div>

        </div>

      </section>

      {/* Alternatives */}
      <section className="alternatives-section">

        <div className="alternatives-heading">

          <div>
            <p className="section-eyebrow">
              OTHER OPTIONS
            </p>

            <h2>Alternative offers</h2>
          </div>

          <Link to={`/compare/${id}`}>
            Compare all →
          </Link>

        </div>

        <div className="alternative-grid">

          <div className="alternative-card">

            <div className="alternative-image">
              Product
            </div>

            <div className="alternative-content">

              <span>AMAZON</span>

              <h3>Product Name</h3>

              <div>
                ⭐ 4.5
                <span> · 12.5K reviews</span>
              </div>

              <strong>₹--</strong>

              <div className="alternative-score">
                SmartBuy Score
                <b>91</b>
              </div>

            </div>

          </div>

          <div className="alternative-card">

            <div className="alternative-image">
              Product
            </div>

            <div className="alternative-content">

              <span>MEESHO</span>

              <h3>Product Name</h3>

              <div>
                ⭐ 4.2
                <span> · 5.4K reviews</span>
              </div>

              <strong>₹--</strong>

              <div className="alternative-score">
                SmartBuy Score
                <b>84</b>
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* Explanation */}
      <section className="explanation">

        <div className="explanation-icon">
          ✦
        </div>

        <div>
          <p className="section-eyebrow">
            SMARTBUY EXPLAINS
          </p>

          <h2>Why not simply choose the cheapest?</h2>

          <p>
            A lower price does not always mean better value.
            SmartBuy considers several factors together so
            the recommendation reflects the overall purchase
            quality rather than price alone.
          </p>
        </div>

      </section>

    </main>
  );
}

export default Recommendation;
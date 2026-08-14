import { Link, useParams } from "react-router-dom";
import "./ProductDetails.css";

function ProductDetails() {
  const { id } = useParams();

  // Temporary mock data
  const product = {
    id: id,
    name: "HP Victus 16 Gaming Laptop",
    brand: "HP",
    image: "https://placehold.co/400x320",
    description:
      "HP Victus gaming laptop with powerful performance for gaming, development and everyday use.",

    specifications: {
      Processor: "AMD Ryzen 7",
      GPU: "NVIDIA RTX 4060",
      RAM: "16 GB",
      Storage: "512 GB SSD",
      Display: "16.1 inch",
    },

    providers: [
      {
        name: "Amazon",
        price: 87499,
        rating: 4.5,
        reviews: 12500,
        seller: "ABC Electronics",
        sellerRating: 4.7,
        cod: true,
        delivery: "Free Delivery",
        warranty: "1 Year",
      },
      {
        name: "Flipkart",
        price: 86999,
        rating: 4.4,
        reviews: 18000,
        seller: "XYZ Retail",
        sellerRating: 4.6,
        cod: true,
        delivery: "Free Delivery",
        warranty: "1 Year",
      },
    ],
  };

  // Find the lowest current price
  const bestOffer = [...product.providers].sort(
    (a, b) => a.price - b.price
  )[0];

  return (
    <div className="product-details">

      {/* Product Overview */}
      <section className="product-main">

        <div className="product-image-large">
          <img
            src={product.image}
            alt={product.name}
          />
        </div>

        <div className="product-summary">

          <p className="product-brand">
            {product.brand}
          </p>

          <h1>{product.name}</h1>

          <div className="product-rating">
            ⭐ {product.providers[0].rating}
            <span>
              {" "}
              ({product.providers[0].reviews.toLocaleString()} reviews)
            </span>
          </div>

          <p className="product-description">
            {product.description}
          </p>

          {/* Best Price */}
          <div className="best-price-box">
            <p>Best Current Price</p>

            <h2>
              ₹{bestOffer.price.toLocaleString()}
            </h2>

            <span>
              Available on {bestOffer.name}
            </span>
          </div>

          {/* Actions */}
          <div className="product-actions">

            <Link
              to={`/compare/${product.id}`}
              className="compare-button"
            >
              Compare All Offers
            </Link>

            <Link
              to={`/recommendation/${product.id}`}
              className="recommend-button"
            >
              Get Smart Recommendation
            </Link>

          </div>

        </div>

      </section>

      {/* Specifications */}
      <section className="specifications">

        <h2>Specifications</h2>

        <div className="spec-grid">

          {Object.entries(product.specifications).map(
            ([key, value]) => (
              <div
                className="spec-item"
                key={key}
              >
                <strong>{key}</strong>
                <span>{value}</span>
              </div>
            )
          )}

        </div>

      </section>

    </div>
  );
}

export default ProductDetails;
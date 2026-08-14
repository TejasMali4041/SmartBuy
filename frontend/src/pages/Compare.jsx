import { useParams, Link } from "react-router-dom";
import "./Compare.css";

function Compare() {
  const { id } = useParams();

  const product = {
    id,
    name: "HP Victus 16 Gaming Laptop",

    offers: [
      {
        provider: "Amazon",
        price: 87499,
        mrp: 99999,
        discount: 12,
        rating: 4.5,
        reviews: 12500,
        seller: "ABC Electronics",
        sellerRating: 4.7,
        cod: true,
        delivery: "Free Delivery",
        warranty: "1 Year",
      },
      {
        provider: "Flipkart",
        price: 86999,
        mrp: 99999,
        discount: 13,
        rating: 4.4,
        reviews: 18000,
        seller: "XYZ Retail",
        sellerRating: 4.6,
        cod: true,
        delivery: "Free Delivery",
        warranty: "1 Year",
      },
      {
        provider: "Meesho",
        price: 89500,
        mrp: 98000,
        discount: 9,
        rating: 4.2,
        reviews: 2100,
        seller: "Tech Store",
        sellerRating: 4.3,
        cod: false,
        delivery: "₹99 Delivery",
        warranty: "1 Year",
      },
    ],
  };

  return (
    <div className="compare-page">

      <div className="compare-header">
        <p>Product Comparison</p>
        <h1>{product.name}</h1>
        <span>Compare all available offers</span>
      </div>

      <div className="comparison-container">

        <table className="comparison-table">

          <thead>
            <tr>
              <th>Feature</th>

              {product.offers.map((offer) => (
                <th key={offer.provider}>
                  {offer.provider}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>

            <tr>
              <td>Price</td>

              {product.offers.map((offer) => (
                <td key={offer.provider} className="price">
                  ₹{offer.price.toLocaleString()}
                </td>
              ))}
            </tr>

            <tr>
              <td>MRP</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  ₹{offer.mrp.toLocaleString()}
                </td>
              ))}
            </tr>

            <tr>
              <td>Discount</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  {offer.discount}%
                </td>
              ))}
            </tr>

            <tr>
              <td>Rating</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  ⭐ {offer.rating}
                </td>
              ))}
            </tr>

            <tr>
              <td>Reviews</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  {offer.reviews.toLocaleString()}
                </td>
              ))}
            </tr>

            <tr>
              <td>Seller</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  {offer.seller}
                </td>
              ))}
            </tr>

            <tr>
              <td>Seller Rating</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  ⭐ {offer.sellerRating}
                </td>
              ))}
            </tr>

            <tr>
              <td>Cash on Delivery</td>

              {product.offers.map((offer) => (
                <td
                  key={offer.provider}
                  className={offer.cod ? "available" : "not-available"}
                >
                  {offer.cod ? "✓ Available" : "✗ Not Available"}
                </td>
              ))}
            </tr>

            <tr>
              <td>Delivery</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  {offer.delivery}
                </td>
              ))}
            </tr>

            <tr>
              <td>Warranty</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  {offer.warranty}
                </td>
              ))}
            </tr>

            <tr>
              <td>Deal</td>

              {product.offers.map((offer) => (
                <td key={offer.provider}>
                  <button className="deal-button">
                    View Deal
                  </button>
                </td>
              ))}
            </tr>

          </tbody>

        </table>

      </div>

      <div className="comparison-actions">

        <Link
          to={`/recommendation/${product.id}`}
          className="smart-button"
        >
          Get Smart Recommendation
        </Link>

      </div>

    </div>
  );
}

export default Compare;
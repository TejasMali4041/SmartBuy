import { Link } from "react-router-dom";
import "./ProductCard.css";

function ProductCard({ product }) {
  return (
    <div className="product-card">

      <div className="product-image">
        <img src={product.image} alt={product.name} />
      </div>

      <div className="product-info">

        <h2>{product.name}</h2>

        <p className="brand">{product.brand}</p>

        <div className="rating">
          ⭐ {product.rating}
          <span> ({product.reviews} reviews)</span>
        </div>

        <p className="lowest-price">
          Starting from <strong>₹{product.lowestPrice}</strong>
        </p>

        <div className="providers">
          {product.providers.map((provider) => (
            <span key={provider}>
              {provider}
            </span>
          ))}
        </div>

        <div className="product-actions">
          <Link to={`/product/${product.id}`}>
            View Product
          </Link>

          <Link to={`/compare/${product.id}`}>
            Compare
          </Link>
        </div>

      </div>

    </div>
  );
}

export default ProductCard;
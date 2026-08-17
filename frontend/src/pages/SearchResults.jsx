import { useSearchParams, Link } from "react-router-dom";
import "./SearchResults.css";

function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <main className="search-page">

      {/* Search Header */}
      <section className="search-top">

        <div>
          <p className="search-eyebrow">SMARTBUY SEARCH</p>

          <h1>
            Search results
            {query && <span> for "{query}"</span>}
          </h1>

          <p className="search-subtitle">
            Compare products, prices and offers across multiple stores.
          </p>
        </div>

        <div className="search-box-large">
          <span>⌕</span>

          <input
            type="text"
            defaultValue={query}
            placeholder="Search for a product..."
          />

          <button>Search</button>
        </div>

      </section>

      <div className="search-layout">

        {/* Filters */}
        <aside className="filters">

          <div className="filter-header">
            <h3>Filters</h3>
            <button>Reset</button>
          </div>

          <div className="filter-group">
            <h4>Price Range</h4>

            <label>
              <input type="checkbox" />
              Under ₹25,000
            </label>

            <label>
              <input type="checkbox" />
              ₹25,000 – ₹50,000
            </label>

            <label>
              <input type="checkbox" />
              ₹50,000 – ₹1,00,000
            </label>

            <label>
              <input type="checkbox" />
              Above ₹1,00,000
            </label>
          </div>

          <div className="filter-group">
            <h4>Rating</h4>

            <label>
              <input type="checkbox" />
              ⭐ 4.5 & above
            </label>

            <label>
              <input type="checkbox" />
              ⭐ 4.0 & above
            </label>

            <label>
              <input type="checkbox" />
              ⭐ 3.5 & above
            </label>
          </div>

          <div className="filter-group">
            <h4>Provider</h4>

            <label>
              <input type="checkbox" />
              Amazon
            </label>

            <label>
              <input type="checkbox" />
              Flipkart
            </label>

            <label>
              <input type="checkbox" />
              Meesho
            </label>

            <label>
              <input type="checkbox" />
              Myntra
            </label>
          </div>

        </aside>

        {/* Results */}
        <section className="results-area">

          <div className="results-toolbar">

            <span>
              Products matching your search
            </span>

            <select defaultValue="relevance">
              <option value="relevance">Sort: Relevance</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>

          </div>

          {/* Temporary product UI */}
          <div className="product-result-card">

            <div className="product-image-placeholder">
              Product Image
            </div>

            <div className="product-main">

              <div className="product-provider">
                <span>AMAZON</span>
              </div>

              <h2>Product will appear here</h2>

              <div className="product-rating">
                ⭐ <strong>4.5</strong>
                <span>12,500 reviews</span>
              </div>

              <p className="product-description">
                Product information, specifications and other details
                will be loaded from the backend.
              </p>

              <div className="product-actions">

                <Link
                  to="/product/placeholder"
                  className="details-button"
                >
                  View Details
                </Link>

                <Link
                  to="/compare/placeholder"
                  className="compare-button"
                >
                  Compare Offers
                </Link>

              </div>

            </div>

            <div className="product-price">

              <small>Starting from</small>

              <strong>₹--</strong>

              <span>Best price</span>

            </div>

          </div>

          <div className="empty-results">

            <div className="empty-icon">⌕</div>

            <h3>Real products will appear here</h3>

            <p>
              Once the SmartBuy backend is connected,
              your search results will be loaded dynamically.
            </p>

          </div>

        </section>

      </div>

    </main>
  );
}

export default SearchResults;
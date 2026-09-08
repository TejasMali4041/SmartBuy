import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import "./SearchResults.css";

function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState(query);

  const handleSearch = (e) => {
    e.preventDefault();

    const trimmedQuery = searchInput.trim();

    if (!trimmedQuery) {
      setSearchParams({});
      return;
    }

    setSearchParams({ q: trimmedQuery });
  };

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

        {/* Search Box */}
        <form
          className="search-box-large"
          onSubmit={handleSearch}
        >
          <span>⌕</span>

          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search for a product..."
          />

          <button type="submit">
            Search
          </button>
        </form>

      </section>

      <div className="search-layout">

        {/* Filters */}
        <aside className="filters">

          <div className="filter-header">
            <h3>Filters</h3>

            <button type="button">
              Reset
            </button>
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

        {/* Results Area */}
        <section className="results-area">

          {/* Toolbar only after search */}
          {query && (
            <div className="results-toolbar">

              <span>
                Products matching your search
              </span>

              <select defaultValue="relevance">
                <option value="relevance">
                  Sort: Relevance
                </option>

                <option value="price-low">
                  Price: Low to High
                </option>

                <option value="price-high">
                  Price: High to Low
                </option>

                <option value="rating">
                  Highest Rated
                </option>
              </select>

            </div>
          )}

          {/* BEFORE SEARCH */}
          {!query && (
            <div className="empty-results">

              <div className="empty-icon">
                ⌕
              </div>

              <h3>
                Search for a product to get started
              </h3>

              <p>
                Enter a product name above and click
                Search to see matching products.
              </p>

            </div>
          )}

          {/* AFTER SEARCH */}
          {query && (
            <>
              {/* Product 1 */}
              <div className="product-result-card">

                <div className="product-image-placeholder">
                  Product 1
                </div>

                <div className="product-main">

                  <div className="product-provider">
                    <span>
                      PRODUCT 1
                    </span>
                  </div>

                  <h2>
                    Product will appear here
                  </h2>

                  <div className="product-rating">
                    ⭐ <strong>--</strong>

                    <span>
                      Reviews will appear here
                    </span>
                  </div>

                  <p className="product-description">
                    Product information, specifications
                    and other details will be loaded
                    from the backend.
                  </p>

                  <div className="product-actions">

                    <Link
                      to="/product/1"
                      className="details-button"
                    >
                      View Details
                    </Link>

                    <Link
                      to="/compare/1"
                      className="compare-button"
                    >
                      Compare Offers
                    </Link>

                  </div>

                </div>

                <div className="product-price">

                  <small>
                    Starting from
                  </small>

                  <strong>
                    ₹--
                  </strong>

                  <span>
                    Best price
                  </span>

                </div>

              </div>

              {/* Product 2 */}
              <div className="product-result-card">

                <div className="product-image-placeholder">
                  Product 2
                </div>

                <div className="product-main">

                  <div className="product-provider">
                    <span>
                      PRODUCT 2
                    </span>
                  </div>

                  <h2>
                    Product will appear here
                  </h2>

                  <div className="product-rating">
                    ⭐ <strong>--</strong>

                    <span>
                      Reviews will appear here
                    </span>
                  </div>

                  <p className="product-description">
                    Product information, specifications
                    and other details will be loaded
                    from the backend.
                  </p>

                  <div className="product-actions">

                    <Link
                      to="/product/2"
                      className="details-button"
                    >
                      View Details
                    </Link>

                    <Link
                      to="/compare/2"
                      className="compare-button"
                    >
                      Compare Offers
                    </Link>

                  </div>

                </div>

                <div className="product-price">

                  <small>
                    Starting from
                  </small>

                  <strong>
                    ₹--
                  </strong>

                  <span>
                    Best price
                  </span>

                </div>

              </div>

             
            </>
          )}

        </section>

      </div>

    </main>
  );
}

export default SearchResults;
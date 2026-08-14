import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (searchQuery.trim() === "") {
      return;
    }

    navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <div className="home">

      <section className="hero">
        <h1>Buy Smarter with SmartBuy</h1>

        <p>
          Compare products, analyze reviews, and make
          intelligent purchase decisions.
        </p>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search for a product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
          />

          <button onClick={handleSearch}>
            Search
          </button>
        </div>
      </section>

      <section className="features">

        <div className="feature-card">
          <h2>Compare Prices</h2>
          <p>
            Compare prices and offers from multiple
            e-commerce platforms.
          </p>
        </div>

        <div className="feature-card">
          <h2>Analyze Reviews</h2>
          <p>
            Use AI-powered sentiment analysis to understand
            customer reviews.
          </p>
        </div>

        <div className="feature-card">
          <h2>Smart Recommendation</h2>
          <p>
            Get an intelligent purchase recommendation based
            on price, quality, reviews and more.
          </p>
        </div>

      </section>

    </div>
  );
}

export default Home;
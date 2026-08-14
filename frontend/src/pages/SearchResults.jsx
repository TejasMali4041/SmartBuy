import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import "./SearchResults.css";

function SearchResults() {
  const [searchParams] = useSearchParams();

  const query = searchParams.get("q") || "";

  const products = [
    {
      id: 1,
      name: "HP Victus 16 Gaming Laptop",
      brand: "HP",
      image: "https://placehold.co/220x180",
      rating: 4.5,
      reviews: 12500,
      lowestPrice: 86999,
      providers: ["Amazon", "Flipkart"]
    },
    {
      id: 2,
      name: "ASUS TUF Gaming A15",
      brand: "ASUS",
      image: "https://placehold.co/220x180",
      rating: 4.4,
      reviews: 9800,
      lowestPrice: 84999,
      providers: ["Amazon", "Flipkart"]
    }
  ];

  return (
    <div className="search-results">

      <div className="results-header">
        <h1>Search Results</h1>
        <p>Results for: <strong>{query}</strong></p>
      </div>

      <div className="results-list">

        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
          />
        ))}

      </div>

    </div>
  );
}

export default SearchResults;
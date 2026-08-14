import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SearchResults from "./pages/SearchResults";
import ProductDetails from "./pages/ProductDetails";
import Compare from "./pages/Compare";
import Recommendation from "./pages/Recommendation";
import PriceHistory from "./pages/PriceHistory";
import ReviewAnalysis from "./pages/ReviewAnalysis";
import Profile from "./pages/Profile";
import Navbar from "./components/Navbar";

function App() {
  return (
    <BrowserRouter>
     <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/compare/:id" element={<Compare />} />
        <Route path="/recommendation/:id" element={<Recommendation />} />
        <Route path="/price-history/:id" element={<PriceHistory />} />
        <Route path="/reviews/:id" element={<ReviewAnalysis />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
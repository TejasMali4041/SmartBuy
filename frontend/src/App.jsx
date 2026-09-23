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
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* Free Public Routes (No login required) */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/compare/:id" element={<Compare />} />

        {/* Members-Only Protected Features (Login Required) */}
        <Route
          path="/price-history/:id"
          element={
            <ProtectedRoute feature="Price History">
              <PriceHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recommendation/:id"
          element={
            <ProtectedRoute feature="AI Recommendations">
              <Recommendation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviews/:id"
          element={
            <ProtectedRoute feature="Review Analysis">
              <ReviewAnalysis />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute feature="Watchlist & Price Alerts">
              <Profile />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
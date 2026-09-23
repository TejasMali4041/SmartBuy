import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);

  // Check whether a user is logged in
  const checkUser = () => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error("Invalid user data:", error);
        localStorage.removeItem("user");
        setUser(null);
      }
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    // Check when Navbar loads
    checkUser();

    // Check whenever route changes
    // This is important after Login -> Home
  }, [location.pathname]);

  useEffect(() => {
    // Listen for login/logout events
    const handleUserChange = () => {
      checkUser();
    };

    window.addEventListener("userLogin", handleUserChange);
    window.addEventListener("userLogout", handleUserChange);

    return () => {
      window.removeEventListener("userLogin", handleUserChange);
      window.removeEventListener("userLogout", handleUserChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");

    // Tell Navbar that user logged out
    window.dispatchEvent(new Event("userLogout"));

    navigate("/");
  };

  return (
    <nav className="navbar">

      {/* Logo */}
      <Link to="/" className="navbar-logo">
        <span className="logo-symbol">S</span>
        <span>SmartBuy</span>
      </Link>

      {/* Center Links */}
      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/search">Explore</Link>
      </div>

      {/* Right Side */}
      <div className="navbar-actions">

        {user ? (
          <>
            <Link
              to="/profile"
              className="profile-link"
            >
              Profile
            </Link>

            <button
              onClick={handleLogout}
              className="logout-nav-button"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">
              Login
            </Link>

            <Link
              to="/register"
              className="get-started"
            >
              Get Started →
            </Link>
          </>
        )}

      </div>

    </nav>
  );
}

export default Navbar;
import { Link } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">

      <Link to="/" className="navbar-logo">
        <span className="logo-symbol">S</span>
        <span>SmartBuy</span>
      </Link>

      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/search">Explore</Link>
      </div>

      <div className="navbar-actions">
        <Link to="/login" className="nav-login">
          Login
        </Link>

        <Link to="/register" className="nav-register">
          Get Started
          <span>→</span>
        </Link>
      </div>

    </nav>
  );
}

export default Navbar;
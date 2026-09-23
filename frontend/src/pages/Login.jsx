import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Login.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });

    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const email = formData.email.trim();
    const password = formData.password;

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email,
            password: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || "Invalid email or password.");
        setLoading(false);
        return;
      }

      // Save token & user session
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
      }

      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        localStorage.setItem(
          "user",
          JSON.stringify({
            name: data.name || "",
            email: data.email || email,
          })
        );
      }

      // Notify Navbar and active components
      window.dispatchEvent(new Event("userLogin"));

      // Redirect to the originally requested protected page if available, else Home
      const redirectPath = location.state?.from || "/";
      navigate(redirectPath, { state: location.state?.forwardState });

    } catch (error) {
      console.error("Login error:", error);
      setError(
        "Unable to connect to the server. Please make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <h1>Welcome Back</h1>

        <p className="auth-subtitle">
          Login to your SmartBuy account
        </p>

        <form onSubmit={handleSubmit}>

          {/* Email */}
          <div className="form-group">

            <label>Email</label>

            <input
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
            />

          </div>

          {/* Password */}
          <div className="form-group">

            <label>Password</label>

            <input
              type="password"
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
            />

          </div>

          {/* Error */}
          {error && (
            <p className="error-message">
              {error}
            </p>
          )}

          {/* Login button */}
          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </form>

        <p className="auth-footer">

          Don't have an account?{" "}

          <Link to="/register">
            Create Account
          </Link>

        </p>

      </div>

    </div>
  );
}

export default Login;
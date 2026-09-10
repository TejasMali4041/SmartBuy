import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Profile.css";

function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      navigate("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    } catch (error) {
      console.error("Invalid user data:", error);

      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");

    navigate("/login");
  };

  if (!user) {
    return null;
  }

  return (
    <main className="profile-page">

      <div className="profile-container">

        {/* Header */}
        <div className="profile-header">

          <p className="profile-eyebrow">
            SMARTBUY ACCOUNT
          </p>

          <h1>
            My Profile
          </h1>

          <p className="profile-subtitle">
            Manage your SmartBuy account information.
          </p>

        </div>

        {/* Profile Card */}
        <section className="profile-card">

          {/* Avatar */}
          <div className="profile-avatar">

            {user.name
              ? user.name.charAt(0).toUpperCase()
              : "U"}

          </div>

          {/* User information */}
          <div className="profile-info">

            <div className="profile-field">

              <span className="profile-label">
                Full Name
              </span>

              <strong>
                {user.name || "User"}
              </strong>

            </div>

            <div className="profile-field">

              <span className="profile-label">
                Email
              </span>

              <strong>
                {user.email || "Email not available"}
              </strong>

            </div>

          </div>

        </section>

        {/* Account Actions */}
        <section className="profile-actions">

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>

        </section>

      </div>

    </main>
  );
}

export default Profile;
import { Link } from "react-router-dom";
import "./Profile.css";

function Profile() {
  return (
    <div className="profile-page">

      <div className="profile-header">
        <div className="profile-avatar">
          T
        </div>

        <div>
          <h1>My Profile</h1>
          <p>Manage your SmartBuy account</p>
        </div>
      </div>

      {/* Personal Information */}

      <section className="profile-section">

        <div className="section-header">
          <div>
            <h2>Personal Information</h2>
            <p>Your account information</p>
          </div>

          <button className="edit-button">
            Edit Profile
          </button>
        </div>

        <div className="profile-info">

          <div className="info-item">
            <span>Full Name</span>
            <strong>Tejas</strong>
          </div>

          <div className="info-item">
            <span>Email</span>
            <strong>tejas@gmail.com</strong>
          </div>

        </div>

      </section>

      {/* Preferences */}

      <section className="profile-section">

        <div className="section-header">
          <div>
            <h2>SmartBuy Preferences</h2>
            <p>
              Preferences used for personalized recommendations
            </p>
          </div>

          <Link
            to="/preferences"
            className="preference-button"
          >
            Set Preferences
          </Link>
        </div>

        <div className="preference-grid">

          <div className="preference-card">
            <span>Budget</span>
            <strong>Not set</strong>
          </div>

          <div className="preference-card">
            <span>Price Importance</span>
            <strong>Not set</strong>
          </div>

          <div className="preference-card">
            <span>Rating Importance</span>
            <strong>Not set</strong>
          </div>

          <div className="preference-card">
            <span>Review Importance</span>
            <strong>Not set</strong>
          </div>

        </div>

      </section>

      {/* Activity */}

      <section className="profile-section">

        <div className="section-header">
          <div>
            <h2>Activity</h2>
            <p>Your SmartBuy activity</p>
          </div>
        </div>

        <div className="activity-grid">

          <div className="activity-card">
            <h3>Recent Searches</h3>
            <p>View your recent product searches.</p>
            <button>View Searches</button>
          </div>

          <div className="activity-card">
            <h3>Saved Products</h3>
            <p>Products you have saved for later.</p>
            <button>View Saved Products</button>
          </div>

          <div className="activity-card">
            <h3>Comparisons</h3>
            <p>View your previous product comparisons.</p>
            <button>View Comparisons</button>
          </div>

        </div>

      </section>

    </div>
  );
}

export default Profile;
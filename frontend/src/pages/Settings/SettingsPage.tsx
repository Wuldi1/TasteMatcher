import { Link } from "react-router-dom";
import { LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ViewerPreferencesControls } from "../../components/Layout/ViewerPreferencesControls";
import "./SettingsPage.css";

const formatRole = (role?: string) =>
  role ? role.replaceAll("_", " ") : "Member";

export function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <p className="settings-page__eyebrow">Your account</p>
        <h1>Settings</h1>
        <p>
          Review your membership and choose how artwork details appear on this
          device.
        </p>
      </header>

      <div className="settings-page__grid">
        <section className="settings-panel" aria-labelledby="account-heading">
          <div className="settings-panel__heading">
            <UserRound aria-hidden="true" />
            <div>
              <p className="settings-panel__kicker">Membership</p>
              <h2 id="account-heading">Account details</h2>
            </div>
          </div>
          <dl className="settings-details">
            <div>
              <dt>Name</dt>
              <dd>{user?.name || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email || "Not available"}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd className="capitalize">{formatRole(user?.role)}</dd>
            </div>
          </dl>
          <p className="settings-panel__note">
            Account identity and access are managed by your gallery. Contact us
            if a detail needs to be corrected.
          </p>
          {user?.role === "customer" ? (
            <Link className="settings-link-button" to="/onboarding">
              Edit taste profile
            </Link>
          ) : null}
        </section>

        <section className="settings-panel" aria-labelledby="display-heading">
          <div className="settings-panel__heading">
            <ShieldCheck aria-hidden="true" />
            <div>
              <p className="settings-panel__kicker">Viewing preferences</p>
              <h2 id="display-heading">Artwork display</h2>
            </div>
          </div>
          <p className="settings-panel__note">
            Currency and dimensions are presentation preferences saved in this
            browser. They do not change gallery records or proposal terms.
          </p>
          <ViewerPreferencesControls defaultExpanded />
        </section>

        <section className="settings-panel" aria-labelledby="help-heading">
          <div className="settings-panel__heading">
            <Mail aria-hidden="true" />
            <div>
              <p className="settings-panel__kicker">Private assistance</p>
              <h2 id="help-heading">Help and policies</h2>
            </div>
          </div>
          <nav className="settings-policy-links" aria-label="Help and policies">
            <a href="mailto:admin@tastematcher.com">Contact TasteMatcher</a>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-of-service">Terms of Service</Link>
          </nav>
        </section>

        <section
          className="settings-panel settings-panel--session"
          aria-labelledby="session-heading"
        >
          <div>
            <p className="settings-panel__kicker">Session</p>
            <h2 id="session-heading">Sign out safely</h2>
            <p className="settings-panel__note">
              End this session on the current device.
            </p>
          </div>
          <button type="button" className="settings-logout" onClick={logout}>
            <LogOut aria-hidden="true" />
            Log out
          </button>
        </section>
      </div>
    </div>
  );
}

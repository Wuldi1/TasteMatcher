import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthPage } from "../pages/Auth/AuthPage";
import { HomePage } from "../pages/Home/HomePage";
import ProtectedRoute from "./ProtectedRoute";
import { Sidebar } from "../components/Layout/Sidebar";
import { MobileSidebar } from "../components/Layout/MobileSidebar";
import { useAuth } from "../contexts/AuthContext";
import { CatalogPage } from "../pages/Catalog/CatalogPage";
import { TasterPage } from "../pages/Taster/TasterPage";
import { UploadPage } from "../pages/Upload/UploadPage";
import { Management } from "../pages/Management/Management";
import { AISuggestionsPage } from "../pages/AISuggestions/AISuggestionsPage";
import SalesPage from "../pages/SalesPage";
import { BuyingProposalPage } from "../pages/BuyingProposal/BuyingProposalPage";
import { OnboardingPage } from "../pages/Onboarding/OnboardingPage";
import { AutomaticUploadsPage } from "../pages/AutomaticUploads/AutomaticUploadsPage";
import { LegalPage } from "../pages/Legal/LegalPage";
import { RoleProtectedRoute } from "./RoleProtectedRoute";
import { AppLoadingState } from "../components/Loading/AppLoadingState";
import { SettingsPage } from "../pages/Settings/SettingsPage";

/**
 * Wrapper component that redirects authenticated users away from auth pages
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();

  // If auth is still initializing, don't decide routing yet (prevents spurious redirects on refresh).
  if (isInitializing) {
    return (
      <div className="route-state route-state--fullscreen">
        <AppLoadingState
          message="Preparing your private gallery..."
          fullScreen
        />
      </div>
    );
  }

  // If we already have a user, redirect away from public auth pages to the app home.
  if (user) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <main className="route-state route-state--fullscreen">
      <div className="route-state__panel">
        <p className="route-state__eyebrow">TasteMatcher</p>
        <h1>This room is not in the collection.</h1>
        <p>The page may have moved, or the address may be incomplete.</p>
        <Link to="/" className="route-state__action">
          Return to TasteMatcher
        </Link>
      </div>
    </main>
  );
}

/**
 * Layout wrapper for protected routes with responsive navigation
 */
function AppLayout({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="app-shell">
      {/* Render only one nav shell to avoid duplicate effects/network requests */}
      {isDesktop ? <Sidebar /> : <MobileSidebar />}

      {/* Main content area */}
      <main className="app-main" id="main-content">
        <div className="app-main__inner">{children}</div>
      </main>
    </div>
  );
}

/**
 * Application routes configuration
 * Handles all routing including auth, onboarding, and protected routes
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/privacy-policy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms-of-service" element={<LegalPage kind="terms" />} />

      {/* Public routes - redirect to /home if authenticated */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />

      {/* Onboarding route - accessible for customers in any status (for editing) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["customer"]}>
              <OnboardingPage />
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Protected routes with responsive layout */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <AppLayout>
              <HomePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/catalog"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={[
                "customer",
                "dealer",
                "domain_owner",
                "global_admin",
              ]}
            >
              <AppLayout>
                <CatalogPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/taster"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["customer"]}>
              <AppLayout>
                <TasterPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={["dealer", "domain_owner", "global_admin"]}
            >
              <AppLayout>
                <UploadPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/automatic-uploads"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["domain_owner", "global_admin"]}>
              <AppLayout>
                <AutomaticUploadsPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/management"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={["dealer", "domain_owner", "global_admin"]}
            >
              <AppLayout>
                <Management />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-suggestions"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["customer"]}>
              <AppLayout>
                <AISuggestionsPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sales"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={["dealer", "domain_owner", "global_admin"]}
            >
              <AppLayout>
                <SalesPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sales/:userId"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={["dealer", "domain_owner", "global_admin"]}
            >
              <AppLayout>
                <SalesPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/buying-proposal"
        element={
          <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={["customer"]}>
              <AppLayout>
                <BuyingProposalPage />
              </AppLayout>
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

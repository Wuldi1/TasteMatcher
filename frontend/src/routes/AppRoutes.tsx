import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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

/**
 * Wrapper component that redirects authenticated users away from auth pages
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();

  // If auth is still initializing, don't decide routing yet (prevents spurious redirects on refresh).
  if (isInitializing) {
    return null; // or a small spinner component if you prefer
  }

  // If we already have a user, redirect away from public auth pages to the app home.
  if (user) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
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
    <div className="flex h-screen overflow-hidden">
      {/* Render only one nav shell to avoid duplicate effects/network requests */}
      {isDesktop ? <Sidebar /> : <MobileSidebar />}

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto bg-gray-50 pb-20 md:pb-0 p-4 sm:p-6 md:p-8">
        {children}
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
            <OnboardingPage />
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
            <AppLayout>
              <CatalogPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/taster"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TasterPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <AppLayout>
              <UploadPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/management"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Management />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-suggestions"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AISuggestionsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sales"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SalesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/buying-proposal"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BuyingProposalPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect to home or login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

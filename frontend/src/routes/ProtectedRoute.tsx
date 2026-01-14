import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isInitializing } = useAuth();

  // While auth is initializing, don't redirect — allow AuthProvider to restore state first.
  if (isInitializing) {
    return null; // or a spinner component
  }

  // If the user is not authenticated after initialization, redirect to the login page.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated -> render provided children (wrapper pattern used in AppRoutes).
  return <>{children}</>;
};

export default ProtectedRoute;

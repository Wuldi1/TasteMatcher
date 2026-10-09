import type { ReactNode } from "react";
import type { Role } from "@tastematcher/common";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AppLoadingState } from "../components/Loading/AppLoadingState";

interface RoleProtectedRouteProps {
  allowedRoles: readonly Role[];
  children: ReactNode;
}

/** Prevents authenticated users from rendering routes outside their role. */
export function RoleProtectedRoute({
  allowedRoles,
  children,
}: RoleProtectedRouteProps) {
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="route-state route-state--fullscreen">
        <AppLoadingState message="Checking gallery access..." fullScreen />
      </div>
    );
  }

  if (!user?.role || !allowedRoles.includes(user.role)) {
    return (
      <main className="route-state route-state--fullscreen">
        <div className="route-state__panel">
          <p className="route-state__eyebrow">Private access</p>
          <h1>This room is reserved.</h1>
          <p>Your account does not have access to this part of TasteMatcher.</p>
          <Link to="/home" className="route-state__action">
            Return home
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

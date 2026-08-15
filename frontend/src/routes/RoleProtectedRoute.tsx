import type { ReactNode } from "react";
import type { Role } from "@tastematcher/common";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

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
    return null;
  }

  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

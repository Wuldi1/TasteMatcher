// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared auth types from context.
// 3. Includes unit tests in ProtectedRoute.spec.tsx.
// 4. Adds structured logging for auth checks.
// 5. Validates user authentication status.
// 6. Reuses AuthContext for access control.
// 7. Accessible loading and redirect states.
// 8. Adds JSDoc for component.
// 9. CI-friendly: passes typecheck and tests.
// -----------------------------------------------------------

import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Protected route wrapper that requires authentication
 * Redirects to auth page if user is not authenticated
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for User.
// 3. Includes unit tests in AuthContext.spec.tsx.
// 4. Adds structured logging for auth events.
// 5. Validates tokens and handles expiry.
// 6. Reuses existing JWT utilities.
// 7. Updates README with auth flow documentation.
// 8. Adds JSDoc for exported context and hooks.
// 9. CI-friendly: passes typecheck and tests.
// -----------------------------------------------------------

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { apiClient } from '../services/api';
import { User as CommonUser } from '@tastematcher/common';

// Use the shared User type
export type User = CommonUser;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean; // Single loading state for initial auth check
  logout: () => void;
  setUserFromToken: (token: string) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Parse JWT token and extract user information
 */
function parseToken(token: string): User | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    const user: User = {
      id: payload.sub || payload.userId || payload.id,
      email: payload.email,
      domainId: payload.domainId || payload.domain_id,
      // Ensure all required fields from the common User type are mapped here
    };

    if (!user.id || !user.email || !user.domainId) {
      console.error('Token is missing required user fields.');
      return null;
    }

    return user;
  } catch (err) {
    console.error('Failed to parse token:', err);
    return null;
  }
}

const isTokenValid = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload?.exp) return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

/**
 * AuthProvider component that manages authentication state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('tm_auth_token');
    apiClient.setAuthToken(null);
    setUser(null);
  }, []);

  const setUserFromToken = useCallback((token: string) => {
    if (isTokenValid(token)) {
      const parsedUser = parseToken(token);
      if (parsedUser) {
        setUser(parsedUser);
        localStorage.setItem('tm_auth_token', token);
        apiClient.setAuthToken(token);
      } else {
        logout(); // Token is invalid or malformed
      }
    } else {
      logout(); // Token is expired
    }
  }, [logout]);

  useEffect(() => {
    const storedToken = localStorage.getItem('tm_auth_token');
    if (storedToken) {
      setUserFromToken(storedToken);
    }
    setIsInitializing(false);
  }, [setUserFromToken]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isInitializing,
      logout,
      setUserFromToken,
    }),
    [user, isInitializing, logout, setUserFromToken],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context.
 * Throws an error if used outside of AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

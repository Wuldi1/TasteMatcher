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
import { User } from '@tastematcher/common';

interface AuthContextType {
  user: Partial<User> | null;
  isAuthenticated: boolean;
  isInitializing: boolean; // Single loading state for initial auth check
  logout: () => void;
  setUserFromToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Parse JWT token and extract user information
 */
function parseToken(token: string): Partial<User> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    const user: Partial<User> = {
      id: payload.id,
      email: payload.email,
      domainId: payload.domainId,
      role: payload.role,
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
  const [user, setUser] = useState<Partial<User> | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('tm_auth_token');
    apiClient.setAuthToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('tm_auth_token');
    if (!token) {
      console.log('No token found in refreshUser');
      return;
    }

    try {
      // Fetch fresh user data with new token from backend
      const { user: freshUser, token: newToken } = await apiClient.refreshCurrentUser();

      // Update stored tokens
      localStorage.setItem('token', newToken);
      localStorage.setItem('tm_auth_token', newToken);

      // Update API client token
      apiClient.setAuthToken(newToken);

      // Update user state with fresh data including personalQuestionnaire
      setUser({
        id: freshUser.id,
        email: freshUser.email,
        domainId: freshUser.domainId,
        role: freshUser.role,
        name: freshUser.name,
        onboardingStatus: freshUser.onboardingStatus || 'not_started',
        personalQuestionnaire: freshUser.personalQuestionnaire,
      });

      console.log('Refreshed user with new token:', freshUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      // If refresh fails, try parsing existing token
      try {
        const decoded = parseToken(token);
        if (decoded) {
          setUser({
            id: decoded.id,
            email: decoded.email,
            domainId: decoded.domainId,
            role: decoded.role,
            name: decoded.name || decoded.email
          });
        }
      } catch (parseError) {
        console.error('Failed to parse token:', parseError);
      }
    }
  }, []);

  const setUserFromToken = useCallback((token: string) => {
    try {
      if (isTokenValid(token) === false) {
        console.error('Token is expired or invalid.');
        logout();
        return;
      }

      const decoded = parseToken(token);
      if (decoded) {
        const userData = {
          id: decoded.id,
          email: decoded.email,
          domainId: decoded.domainId,
          role: decoded.role,
          name: decoded.name || decoded.email,
          onboardingStatus: decoded.onboardingStatus || 'not_started',
          // personalQuestionnaire will be loaded when needed via refreshUser
        };

        console.log('Setting user from token:', userData);
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to parse token:', error);
      logout();
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
      refreshUser,
    }),
    [user, isInitializing, logout, setUserFromToken, refreshUser],
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

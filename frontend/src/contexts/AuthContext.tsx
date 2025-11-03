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

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../services/api';

export interface User {
  id: string;
  email: string;
  domainId: string;
  domainName?: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, domainName: string) => Promise<void>;
  logout: () => void;
  setUserFromToken: (token: string) => void; // Add this method
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Parse JWT token and extract user information
 */
function parseToken(token: string): User | null {
  try {
    console.log('Parsing token...');
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid token format: expected 3 parts, got', parts.length);
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);

    const user: User = {
      id: payload.sub || payload.userId || payload.id,
      email: payload.email,
      domainId: payload.domainId || payload.domain_id,
      domainName: payload.domainName || payload.domain_name,
      role: payload.role || 'user',
    };

    console.log('Parsed user:', user);

    // Validate required fields
    if (!user.id || !user.email || !user.domainId) {
      console.error('Token missing required fields:', { 
        hasId: !!user.id, 
        hasEmail: !!user.email, 
        hasDomainId: !!user.domainId 
      });
      return null;
    }

    return user;
  } catch (err) {
    console.error('Failed to parse token:', err);
    return null;
  }
}

/**
 * AuthProvider component that manages authentication state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      console.log('AuthProvider: Initializing authentication...');
      const token = localStorage.getItem('token');
      
      if (token) {
        console.log('AuthProvider: Token found, parsing user...');
        const parsedUser = parseToken(token);
        if (parsedUser) {
          console.log('AuthProvider: User parsed successfully', { userId: parsedUser.id, domainId: parsedUser.domainId });
          setUser(parsedUser);
          // Ensure API client has the token
          apiClient.setAuthToken(token);
        } else {
          console.log('AuthProvider: Failed to parse token, removing...');
          localStorage.removeItem('token');
        }
      } else {
        console.log('AuthProvider: No token found');
      }
      
      setIsLoading(false);
      console.log('AuthProvider: Authentication initialization complete');
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const { token } = await response.json();
    
    const parsedUser = parseToken(token);
    if (parsedUser) {
      setUser(parsedUser);
      localStorage.setItem('token', token);
      apiClient.setAuthToken(token);
    }
  };

  const register = async (email: string, password: string, domainName: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, domainName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const { token } = await response.json();
    
    const parsedUser = parseToken(token);
    if (parsedUser) {
      setUser(parsedUser);
      localStorage.setItem('token', token);
      apiClient.setAuthToken(token);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    apiClient.clearAuthToken();
  };

  const setUserFromToken = (token: string) => {
    const parsedUser = parseToken(token);
    if (parsedUser) {
      setUser(parsedUser);
      localStorage.setItem('token', token);
      apiClient.setAuthToken(token);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, setUserFromToken }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

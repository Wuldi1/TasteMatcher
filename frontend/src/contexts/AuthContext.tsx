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
import { apiClient } from '../utils/api';
import { User, UserStatsResponse, PersonalQuestionnaire } from '@tastematcher/common';

interface AuthContextType {
  user: Partial<User> | null;
  isAuthenticated: boolean;
  isInitializing: boolean; // Single loading state for initial auth check
  logout: () => void;
  setUserFromToken: (token: string) => void;
  setUserFromUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<Partial<User>>;
  // User Stats capabilities
  stats: UserStatsResponse | null;
  answeredQuestions: number;
  totalQuestions: number;
  isStatsLoading: boolean;
  refreshStats: () => Promise<void>;
  incrementSwipeCount: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Calculate the total number of questions in the PersonalQuestionnaire interface.
 * @returns The total number of questions.
 */
function calculateTotalQuestions(): number {
    // 1. Collection Type
    // 2. About Yourself
    // 3. Current Location
    // 4. Other Residences
    // 5. Collection Goals
    // 6. Aesthetic Admiration (Description + Images)
    return 6;
}

/**
 * Calculate the number of answered questions in the PersonalQuestionnaire.
 * @param questionnaire - The user's personal questionnaire.
 * @returns The number of answered questions.
 */
function calculateAnsweredQuestions(questionnaire: PersonalQuestionnaire): number {
    let count = 0;
    if (questionnaire.collectionType) count++;
    if (questionnaire.aboutYourself) count++;
    if (questionnaire.currentLocation) count++;
    if (questionnaire.hasOtherResidences !== undefined) count++;
    if (questionnaire.collectionGoals) count++;
    
    const hasAdmirationText = !!questionnaire.aestheticAdmiration?.description;
    const hasAdmirationImages = (questionnaire.aestheticAdmiration?.imageUrls?.length ?? 0) > 0;
    if (hasAdmirationText || hasAdmirationImages) count++;

    return count;
}

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
  
  // Stats state
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem('tm_auth_token');
    apiClient.setAuthToken(null);
    setUser(null);
    setStats(null);
    setAnsweredQuestions(0);
    setTotalQuestions(0);
  }, []);

  const refreshUser = useCallback(async (user: Partial<User>) => {
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
      setUserFromUser(freshUser);
      return freshUser;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      // If refresh fails, try parsing existing token
      setUserFromToken(token);
      return user;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUserFromUser = useCallback((userData: Partial<User>) => {
    setUser({
      id: userData.id,
      email: userData.email,
      domainId: userData.domainId,
      role: userData.role,
      name: userData.name,
      onboardingStatus: userData.onboardingStatus || 'not_started',
      personalQuestionnaire: userData.personalQuestionnaire,
      swipeCount: userData.swipeCount || 0,
      comments: userData.comments || [],
    });

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

        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to parse token:', error);
      logout();
    }
  }, [logout]);

  const refreshStats = useCallback(async () => {
    if (!user?.id || !user?.domainId) return;

    setIsStatsLoading(true);
    try {
        const fetchedStats = await apiClient.getUserStats();
        setStats(fetchedStats);

        // Calculate answered and total questions
        if (user.personalQuestionnaire) {
            setAnsweredQuestions(calculateAnsweredQuestions(user.personalQuestionnaire as PersonalQuestionnaire));
            setTotalQuestions(calculateTotalQuestions());
        }
    } catch (err) {
        console.error('Failed to fetch user stats:', err);
    } finally {
        setIsStatsLoading(false);
    }
  }, [user]);

  const incrementSwipeCount = useCallback(() => {
    setStats((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        totalSwiped: prev.totalSwiped + 1,
      };
    });
    
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        swipeCount: (prev.swipeCount || 0) + 1,
      };
    });
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('tm_auth_token');
    if (storedToken) {
      setUserFromToken(storedToken);
    }
    setIsInitializing(false);
  }, [setUserFromToken]);

  // Fetch stats when user changes
  useEffect(() => {
    if (user?.id) {
        refreshStats();
    } else {
        setStats(null);
    }
  }, [user?.id, refreshStats]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isInitializing,
      logout,
      setUserFromToken,
      setUserFromUser,
      refreshUser,
      // Stats
      stats,
      answeredQuestions,
      totalQuestions,
      isStatsLoading,
      refreshStats,
      incrementSwipeCount,
    }),
    [user, isInitializing, logout, setUserFromToken, setUserFromUser, refreshUser, stats, answeredQuestions, totalQuestions, isStatsLoading, refreshStats, incrementSwipeCount],
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

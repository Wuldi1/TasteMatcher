import type { useAuth } from "../../contexts/AuthContext";

export type MockAuthContext = ReturnType<typeof useAuth>;

export const createMockAuthContext = (
  overrides: Partial<MockAuthContext> = {},
): MockAuthContext => ({
  user: null,
  isAuthenticated: false,
  isInitializing: false,
  logout: jest.fn(),
  setUserFromToken: jest.fn(),
  setUserFromUser: jest.fn(),
  refreshUser: jest.fn().mockResolvedValue(null),
  stats: null,
  answeredQuestions: 0,
  totalQuestions: 0,
  isStatsLoading: false,
  refreshStats: jest.fn().mockResolvedValue(undefined),
  incrementSwipeCount: jest.fn(),
  ...overrides,
});

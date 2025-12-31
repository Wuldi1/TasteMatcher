import { vi } from 'vitest';
import type { useAuth } from '../../contexts/AuthContext';

export type MockAuthContext = ReturnType<typeof useAuth>;

export const createMockAuthContext = (overrides: Partial<MockAuthContext> = {}): MockAuthContext => ({
  user: null,
  isAuthenticated: false,
  isInitializing: false,
  logout: vi.fn(),
  setUserFromToken: vi.fn(),
  setUserFromUser: vi.fn(),
  refreshUser: vi.fn().mockResolvedValue(null),
  stats: null,
  answeredQuestions: 0,
  totalQuestions: 0,
  isStatsLoading: false,
  refreshStats: vi.fn().mockResolvedValue(undefined),
  incrementSwipeCount: vi.fn(),
  ...overrides,
});

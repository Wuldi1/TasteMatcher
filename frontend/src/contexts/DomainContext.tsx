// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for domain data.
// 3. Includes proper state management and error handling.
// 4. Adds structured logging for authentication events.
// 5. Adds input validation for domain operations.
// 6. Centralized domain state management.
// 7. Professional error handling and user feedback.
// 8. Includes JSDoc for exported context.
// 9. CI-friendly: passes typecheck and lint.
// -----------------------------------------------------------

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { DomainResponse } from 'common';

interface DomainContextType {
  currentDomain: DomainResponse | null;
  isLoading: boolean;
  error: string | null;
  setCurrentDomain: (domain: DomainResponse | null) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const DomainContext = createContext<DomainContextType | undefined>(undefined);

interface DomainProviderProps {
  children: ReactNode;
}

/**
 * Domain authentication context provider
 * Manages the currently authenticated domain state
 */
export function DomainProvider({ children }: DomainProviderProps) {
  const [currentDomain, setCurrentDomainState] = useState<DomainResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCurrentDomain = useCallback((domain: DomainResponse | null) => {
    console.info('Domain Authentication:', { 
      domainId: domain?.id, 
      domainName: domain?.name,
      action: domain ? 'login' : 'logout'
    });
    setCurrentDomainState(domain);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const value: DomainContextType = {
    currentDomain,
    isLoading,
    error,
    setCurrentDomain,
    clearError,
    setLoading,
    setError,
  };

  return (
    <DomainContext.Provider value={value}>
      {children}
    </DomainContext.Provider>
  );
}

/**
 * Hook to access domain context
 * @throws Error if used outside DomainProvider
 */
export function useDomain(): DomainContextType {
  const context = useContext(DomainContext);
  if (context === undefined) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
}

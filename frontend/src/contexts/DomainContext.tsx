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

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Domain } from '@tastematcher/common';
import { useAuth } from './AuthContext';
import { apiClient } from '../services/api';

interface DomainContextType {
  currentDomain: Domain | null;
  setCurrentDomain: (domain: Domain | null) => void;
  isLoading: boolean;
}

export const DomainContext = createContext<DomainContextType | undefined>(undefined);

const DOMAIN_STORAGE_KEY = 'tm_current_domain';

export function DomainProvider({ children }: { children: ReactNode }) {
  const [currentDomain, _setCurrentDomain] = useState<Domain | null>(() => {
    try {
      const storedDomain = sessionStorage.getItem(DOMAIN_STORAGE_KEY);
      return storedDomain ? JSON.parse(storedDomain) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setLoading] = useState(true);
  const { user, isInitializing: isAuthInitializing } = useAuth();

  const setCurrentDomain = useCallback((domain: Domain | null) => {
    _setCurrentDomain(domain);
    if (domain) {
      sessionStorage.setItem(DOMAIN_STORAGE_KEY, JSON.stringify(domain));
    } else {
      sessionStorage.removeItem(DOMAIN_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const syncDomain = async () => {
      // If auth is still initializing, wait.
      if (isAuthInitializing) {
        return;
      }

      // If there is no authenticated user, clear the domain.
      if (!user) {
        if (currentDomain) {
          setCurrentDomain(null);
        }
        setLoading(false);
        return;
      }

      // If we have a user, but the cached domain doesn't match, something is wrong.
      // This can happen if the user logs into a different account.
      if (currentDomain && user.domainId !== currentDomain.id) {
        // The cached domain is stale, clear it and re-fetch.
        setCurrentDomain(null); 
      }
      
      // If we have a user and a matching domain in cache, we are done.
      if (currentDomain && user.domainId === currentDomain.id) {
        setLoading(false);
        return;
      }

      // If we have a user but no domain, fetch it. This only runs once per session.
      if (user.domainId && !currentDomain) {
        setLoading(true);
        try {
          const domain = await apiClient.getDomainById(user.domainId);
          setCurrentDomain(domain);
        } catch (error) {
          console.error('Failed to fetch domain details:', error);
          setCurrentDomain(null);
        } finally {
          setLoading(false);
        }
      }
    };

    syncDomain();
  }, [user, isAuthInitializing, currentDomain, setCurrentDomain]);

  const value = useMemo(
    () => ({ currentDomain, setCurrentDomain, isLoading }),
    [currentDomain, setCurrentDomain, isLoading],
  );

  return (
    <DomainContext.Provider value={value}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain() {
  const context = useContext(DomainContext);
  if (context === undefined) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
}

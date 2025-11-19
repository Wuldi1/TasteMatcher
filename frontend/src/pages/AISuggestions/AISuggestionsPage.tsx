// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: UI changes must be responsive (mobile + desktop) and smooth (no visual regressions). Include accessibility considerations (semantic markup, aria attributes, keyboard navigation, focus management) and automated accessibility checks (axe, Playwright/accessibility audit) where applicable.
// -----------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { Artwork, User } from '@tastematcher/common';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';

interface DomainUserOption {
  id: string;
  label: string;
  onboardingStatus?: string;
  swipeCount?: number;
}

/**
 * AISuggestionsPage
 * - If `userId` prop is provided, fetch suggestions for that user (used by SalesPage).
 * - If `userId` prop is not provided, keep existing domain-owner selection behavior.
 */
export const AISuggestionsPage = ({ userId }: { userId?: string } = {}) => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Artwork[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | undefined>(undefined); // Default to undefined
  const [users, setUsers] = useState<DomainUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isDomainOwner =
    user?.role === 'domain_owner' || user?.role === 'global_admin';

  // targetUserId: if prop `userId` supplied, use it; otherwise fall back to existing logic
  const targetUserId = useMemo(() => {
    if (userId) return userId;
    if (isDomainOwner) {
      return selectedUser || user?.id;
    }
    return user?.id;
  }, [userId, isDomainOwner, selectedUser, user?.id]);

  const targetUser = useMemo(() => {
    if (userId) {
      // when a userId prop is provided we may not have full user object in `users` list;
      // leave targetUser undefined (eligibility checks will be skipped in prop mode)
      return users.find((u) => u.id === (selectedUser || user?.id));
    }
    if (isDomainOwner) {
      return users.find((u) => u.id === (selectedUser || user?.id));
    }
    return user;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDomainOwner, selectedUser, user?.id, users, userId]);

  // compute eligibility: when userId prop is provided we assume recommendations fetch is forced
  const eligibility = useMemo(() => {
    if (userId) {
      return { isEligible: true, reasons: [] as string[] };
    }
    return getAIRecommendationsEligibility(targetUser as User);
  }, [userId, targetUser]);

  useEffect(() => {
    // Load domain users only if domain owner AND no explicit prop userId was provided
    if (!isDomainOwner || userId) {
      return;
    }

    const fetchUsers = async () => {
      try {
        const domainUsers = await apiClient.getAllUsers(user?.domainId);
        setUsers(
          domainUsers.map((domainUser) => ({
            id: domainUser.id,
            label: domainUser.name ?? domainUser.email ?? domainUser.id,
            onboardingStatus: (domainUser as any).onboardingStatus,
            swipeCount: (domainUser as any).swipeCount,
          })),
        );
      } catch (err) {
        console.error('Failed to load users for AI suggestions', err);
        setError('Unable to load users. Try again later.');
      }
    };

    void fetchUsers();
    // stable dependencies only (primitives) to avoid re-running on user object identity changes
  }, [isDomainOwner, user?.domainId, userId]);

  useEffect(() => {
    // Use only stable primitives in deps to avoid effect re-running due to object identity changes.
    if (!targetUserId || !user?.domainId) {
      setRecommendations([]);
      return;
    }

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        // If userId prop provided, always request recommendations for that user
        const recommendations = await apiClient.getRecommendations(
          user.domainId!,
          // if domain owner and selectedUser differs from current user, pass the target user id
          targetUserId !== user?.id ? targetUserId : undefined,
        );
        setRecommendations(recommendations);
      } catch (err) {
        console.error('Failed to load AI suggestions', err);
        // Only show an error when eligibility indicates we should have suggestions (skip when forced-by-prop)
        if (!userId && eligibility.isEligible) {
          setError('Unable to load AI suggestions. Please try again.');
        }
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchRecommendations();
  // only depend on stable primitives: domain id, targetUserId prop, eligibility flag and userId prop
  }, [targetUserId, user?.domainId, user?.id, eligibility.isEligible, userId]);

  const formatMatchPercentage = (score?: number): string => {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return '0.00%';
    }
    const truncated = Math.floor(score * 10000) / 100;
    return `${truncated.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        role="status"
        aria-live="polite"
      >
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"
          aria-label="Loading AI suggestions"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">AI Suggestions</h1>
        <p className="text-sm text-gray-600 sm:text-base">
          Discover artworks closely aligned with personal taste profiles.
        </p>
      </header>

      {/* Show domain-owner selector only when prop userId is not provided */}
      {!userId && isDomainOwner && (
        <div className="mb-6">
          <label
            htmlFor="ai-suggestions-user"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            View suggestions for
          </label>
          <select
            id="ai-suggestions-user"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedUser || ''} // Default to empty string if undefined
            onChange={(event) => setSelectedUser(event.target.value || undefined)}
          >
            {!selectedUser && <option value="">Select a user</option>}
            <option value={user?.id}>Myself</option>
            {users
              .filter((option) => option.id !== user?.id)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Informational messages */}
      {!userId && !selectedUser && isDomainOwner && (
        <div
          className="mx-auto mb-6 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <h2 className="text-base font-medium text-blue-900">
            Please select a user to view AI suggestions
          </h2>
        </div>
      )}

      {/* Eligibility warning (only when not forced by prop) */}
      {!userId && selectedUser && !eligibility.isEligible && (
        <div
          className="mx-auto mb-6 max-w-2xl rounded-lg border border-yellow-200 bg-yellow-50 p-6"
          role="alert"
          aria-live="polite"
        >
          <h2 className="mb-3 text-lg font-semibold text-yellow-900">
            This profile is almost ready for AI suggestions
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-yellow-800">
            {eligibility.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {eligibility.isEligible && recommendations.length > 0 && (
        <section
          aria-label="AI suggested artworks"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {recommendations.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-lg shadow transition hover:shadow-lg focus-within:ring-2 focus-within:ring-primary"
              tabIndex={0}
              aria-label={`${item.title} - similarity ${formatMatchPercentage(item.probabilityMatch)}`}
            >
              {item.filename ? (
                <img
                  src={item.filename}
                  alt={item.title}
                  className="h-48 w-full object-cover sm:h-60"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center bg-gray-100 text-sm text-gray-500 sm:h-60">
                  No image available
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <h3 className="mb-2 line-clamp-2 text-base font-semibold text-gray-900">
                  {item.title}
                </h3>
                <div className="mt-auto flex items-center justify-between text-sm text-gray-600">
                  <span>Match</span>
                  <span className="font-medium text-primary">
                    {formatMatchPercentage(item.probabilityMatch)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {eligibility.isEligible && recommendations.length === 0 && (
        <p className="py-12 text-center text-gray-600">
          No AI suggestions yet. Encourage additional tasting activity to enrich personalization.
        </p>
      )}
    </div>
  );
};

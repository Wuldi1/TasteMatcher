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
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Artwork, User } from '@tastematcher/common';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';

interface DomainUserOption {
  id: string;
  label: string;
  onboardingStatus?: string;
  swipeCount?: number;
}

export const AISuggestionsPage = () => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Artwork[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<DomainUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isDomainOwner =
    user?.role === 'domain_owner' || user?.role === 'global_admin';

  const targetUserId = useMemo(() => {
    if (isDomainOwner) {
      return selectedUser || user?.id;
    }
    return user?.id;
  }, [isDomainOwner, selectedUser, user?.id]);

  const targetUser = useMemo(() => {
    if (isDomainOwner) {
      return users.find((u) => u.id === (selectedUser || user?.id));
    }
    return user;
  }, [isDomainOwner, selectedUser, user?.id]);

  useEffect(() => {
    if (!isDomainOwner) {
      return;
    }

    const fetchUsers = async () => {
      try {
        const domainUsers = await apiClient.getAllUsers();
        setUsers(
          domainUsers.map((u) => ({
            id: u.id,
            label: u.name ?? u.email ?? u.id,
            onboardingStatus: (u as any).onboardingStatus,
            swipeCount: (u as any).swipeCount,
          })),
        );
      } catch (err) {
        console.error('Failed to load users for AI suggestions', err);
        setError('Unable to load users. Try again later.');
      }
    };

    void fetchUsers();
  }, [isDomainOwner]);

  useEffect(() => {
    if (!targetUserId || !user?.domainId) {
      return;
    }

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const recommendations = await apiClient.getRecommendations(
          user.domainId!,
          isDomainOwner && targetUserId !== user.id ? targetUserId : undefined,
        );
        setRecommendations(recommendations);
      } catch (err) {
        console.error('Failed to load AI suggestions', err);
        setError('Unable to load AI suggestions. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void fetchRecommendations();
  }, [isDomainOwner, targetUserId, user]);

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

      {isDomainOwner && (
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
            value={targetUserId}
            onChange={(event) => setSelectedUser(event.target.value)}
          >
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

      {getAIRecommendationsEligibility(targetUser as User).isEligible && (
        <div
          className="mx-auto mb-6 max-w-2xl rounded-lg border border-yellow-200 bg-yellow-50 p-6"
          role="alert"
          aria-live="polite"
        >
          <h2 className="mb-3 text-lg font-semibold text-yellow-900">
            This profile is almost ready for AI suggestions
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-yellow-800">
            {getAIRecommendationsEligibility(targetUser as User).reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {getAIRecommendationsEligibility(targetUser as User).isEligible && recommendations.length > 0 && (
        <section
          aria-label="AI suggested artworks"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {recommendations.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-lg shadow transition hover:shadow-lg focus-within:ring-2 focus-within:ring-primary"
              tabIndex={0}
              aria-label={`${item.title} - similarity ${Math.round(item.probabilityMatch || 0 * 100)} percent`}
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
                    {Math.round(item.probabilityMatch || 0 * 100)}%
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {getAIRecommendationsEligibility(targetUser as User).isEligible && recommendations.length === 0 && (
        <p className="py-12 text-center text-gray-600">
          No AI suggestions yet. Encourage additional tasting activity to enrich personalization.
        </p>
      )}
    </div>
  );
};

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
import { ThumbsUp, ThumbsDown, FileText, X } from 'lucide-react';
import { useSavePreference } from '../../utils/savePreference';

interface DomainUserOption {
  id: string;
  label: string;
  onboardingStatus?: string;
  swipeCount?: number;
}

export const AISuggestionsPage = ({
  userId,
  proposalItems,
  onAddToProposal,
  onArtworkClick,
  readonlyThumbs = false,
}: {
  userId?: string;
  proposalItems?: string[]; // List of artwork IDs already in the proposal
  onAddToProposal?: (artwork: Artwork) => void; // Callback to add artwork to the proposal
  onArtworkClick?: (artwork: Artwork) => void; // Callback to open artwork details
  readonlyThumbs?: boolean;
} = {}) => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Artwork[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [selectedUser] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<DomainUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isDomainOwner =
    user?.role === 'domain_owner' || user?.role === 'global_admin';

  const targetUserId = useMemo(() => {
    if (userId) return userId;
    if (isDomainOwner) {
      return selectedUser || user?.id;
    }
    return user?.id;
  }, [userId, isDomainOwner, selectedUser, user?.id]);

  const targetUser = useMemo(() => {
    if (userId) {
      return users.find((u) => u.id === (selectedUser || user?.id));
    }
    if (isDomainOwner) {
      return users.find((u) => u.id === (selectedUser || user?.id));
    }
    return user;
  }, [isDomainOwner, selectedUser, user, users, userId]);

  const eligibility = useMemo(() => {
    if (userId) {
      return { isEligible: true, reasons: [] as string[] };
    }
    return getAIRecommendationsEligibility(targetUser as User);
  }, [userId, targetUser]);

  useEffect(() => {
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
  }, [isDomainOwner, user?.domainId, userId]);

  useEffect(() => {
    if (!targetUserId || !user?.domainId) {
      setRecommendations([]);
      return;
    }

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const recommendations = await apiClient.getRecommendations(
          user.domainId!,
          targetUserId !== user?.id ? targetUserId : undefined,
        );
        setRecommendations(recommendations);
      } catch (err) {
        console.error('Failed to load AI suggestions', err);
        if (!userId && eligibility.isEligible) {
          setError('Unable to load AI suggestions. Please try again.');
        }
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchRecommendations();
  }, [targetUserId, user?.domainId, user?.id, eligibility.isEligible, userId]);


  const savePreferenceMutation = useSavePreference({
    domainId: user?.domainId!,
    userId: user?.id!,
    onOptimisticUpdate: (artworkId: string, arg2?: any, arg3?: any) => {
      // Support both callback signatures:
      // - onOptimisticUpdate(artworkId, liked)
      // - onOptimisticUpdate(artworkId, domainId, liked)
      const liked = typeof arg2 === 'boolean' ? arg2 : Boolean(arg3);

      // Update recommendation list defensively
      setRecommendations((prev) =>
        prev.map((artwork) =>
          artwork.id === artworkId ? { ...artwork, likedStatus: liked ? 'Liked' : 'Disliked' } : artwork
        )
      );

      // Update selected artwork if open
      setSelectedArtwork((prev) =>
        prev && prev.id === artworkId ? { ...prev, likedStatus: liked ? 'Liked' : 'Disliked' } : prev
      );
    },
  });


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

  const handleCloseModal = () => {
    setSelectedArtwork(null);
  };

  const handlePreferenceClick = (artworkId: string, liked: boolean) => {
    savePreferenceMutation.mutate({ artworkId, domainId: user.domainId, liked });
  };

  const handleProposalToggle = (artwork: Artwork) => {
    if (onAddToProposal) {
      onAddToProposal(artwork);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">AI Suggestions</h1>
        <p className="text-sm text-gray-600 sm:text-base">
          Discover artworks closely aligned with personal taste profiles.
        </p>
      </header>

      {error && (
        <div className="text-red-600 mb-4">
          {error}
        </div>
      )}

      {eligibility.isEligible && recommendations.length > 0 && (
        <section
          aria-label="AI suggested artworks"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {recommendations.map((item) => {
            const isInProposal = proposalItems?.includes(item.id);

            return (
              <article
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-lg shadow transition hover:shadow-lg focus-within:ring-2 focus-within:ring-primary relative"
                tabIndex={0}
                aria-label={`${item.title} - similarity ${formatMatchPercentage(item.probabilityMatch)}`}
              >
                {/* Proposal Badge */}
                {isInProposal && (
                  <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded">
                    In Proposal
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtwork(item);
                    onArtworkClick?.(item);
                  }}
                  className="block w-full h-48 bg-gray-100 overflow-hidden sm:h-60"
                >
                  {item.filename ? (
                    <img
                      src={item.filename}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500">
                      No image available
                    </div>
                  )}
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="mb-2 line-clamp-2 text-base font-semibold text-gray-900">
                    {item.title}
                  </h3>
                  {item.price !== undefined && (
                    <div className="text-xs text-green-700 font-semibold mb-1">${item.price.toLocaleString()}</div>
                  )}
                  <div className="mt-auto flex items-center justify-between text-sm text-gray-600">
                    <span>Match</span>
                    <span className="font-medium text-primary">
                      {formatMatchPercentage(item.probabilityMatch)}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={readonlyThumbs}
                        onClick={() => !readonlyThumbs && handlePreferenceClick(item.id, true)}
                        className={`p-2 rounded-full ${item.likedStatus === 'Liked'
                          ? 'hover:bg-green-300'
                          : (readonlyThumbs ? '' : 'hover:bg-green-200')
                          }`}
                        aria-label="Thumbs up"
                        tabIndex={readonlyThumbs ? -1 : 0}
                      >
                        <ThumbsUp
                          className={`w-5 h-5 ${readonlyThumbs ? '' : 'hover:text-green-500'} ${item.likedStatus === 'Liked' ? 'text-green-600' : 'text-gray-400'}`}
                        />
                      </button>
                      <button
                        type="button"
                        disabled={readonlyThumbs}
                        onClick={() => !readonlyThumbs && handlePreferenceClick(item.id, false)}
                        className={`p-2 rounded-full ${item.likedStatus === 'Disliked'
                          ? 'hover:bg-red-300'
                          : (readonlyThumbs ? '' : 'hover:bg-red-200')}`}
                        aria-label="Thumbs down"
                        tabIndex={readonlyThumbs ? -1 : 0}
                      >
                        <ThumbsDown
                          className={`w-5 h-5 ${readonlyThumbs ? '' : 'hover:text-red-500'} ${item.likedStatus === 'Disliked' ? 'text-red-600' : 'text-gray-400'}`}
                        />
                      </button>
                    </div>
                    {onAddToProposal && (
                      <button
                        type="button"
                        onClick={() => handleProposalToggle(item)}
                        className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 ${isInProposal
                            ? 'bg-green-100 hover:bg-green-200 focus:ring-green-500'
                            : 'bg-blue-100 hover:bg-blue-200 focus:ring-blue-500'
                          }`}
                        aria-label={isInProposal ? 'Remove from Proposal' : 'Add to Proposal'}
                      >
                        <FileText
                          className={`w-5 h-5 ${isInProposal ? 'text-green-600' : 'text-blue-600'}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {eligibility.isEligible && recommendations.length === 0 && (
        <p className="py-12 text-center text-gray-600">
          No AI suggestions yet. Encourage additional tasting activity to enrich personalization.
        </p>
      )}

      {/* Modal for artwork details */}
      {selectedArtwork && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={handleCloseModal}
        >
          <div
            className="relative bg-white rounded-lg shadow-lg w-full max-w-4xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              onClick={handleCloseModal}
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0 w-full md:w-1/2">
                <img
                  src={selectedArtwork.filename}
                  alt={selectedArtwork.title}
                  className="rounded-lg object-cover w-full h-96"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <h2 id="modal-title" className="text-2xl font-bold text-gray-900 mb-4">
                  {selectedArtwork.title}
                </h2>
                {selectedArtwork.price !== undefined && (
                  <div className="text-lg text-green-700 font-semibold mb-2">${selectedArtwork.price.toLocaleString()}</div>
                )}
                {selectedArtwork.artist && (
                  <p className="text-lg text-gray-700 mb-2">
                    <span className="font-semibold">Artist:</span> {selectedArtwork.artist}
                  </p>
                )}
                {selectedArtwork.date && (
                  <p className="text-lg text-gray-700 mb-2">
                    <span className="font-semibold">Date:</span> {selectedArtwork.date}
                  </p>
                )}
                {selectedArtwork.description && (
                  <p className="text-sm text-gray-600 mb-4">{selectedArtwork.description}</p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedArtwork.classification && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                      {selectedArtwork.classification}
                    </span>
                  )}
                  {selectedArtwork.department && (
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      {selectedArtwork.department}
                    </span>
                  )}
                  {selectedArtwork.country && (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                      {selectedArtwork.country}
                    </span>
                  )}
                  {selectedArtwork.tags &&
                    selectedArtwork.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                </div>

                <div className="mt-4 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() => handlePreferenceClick(selectedArtwork.id, true)}
                    aria-label="Like artwork"
                    className={`p-2 rounded-full ${readonlyThumbs ? '' : 'hover:bg-green-100'} ${selectedArtwork.likedStatus === 'Liked' ? 'bg-green-100' : 'bg-gray-100'}`}
                  >
                    <ThumbsUp className={`w-6 h-6 ${readonlyThumbs ? '' : 'hover:text-green-500'} ${selectedArtwork.likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-400'}`} />
                  </button>
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() => handlePreferenceClick(selectedArtwork.id, false)}
                    aria-label="Dislike artwork"
                    className={`p-2 rounded-full ${readonlyThumbs ? '' : 'hover:bg-red-100'} ${selectedArtwork.likedStatus === 'Disliked' ? 'bg-red-100' : 'bg-gray-100'}`}
                  >
                    <ThumbsDown className={`w-6 h-6 ${readonlyThumbs ? '' : 'hover:text-red-500'} ${selectedArtwork.likedStatus === 'Disliked' ? 'text-red-500' : 'text-gray-400'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

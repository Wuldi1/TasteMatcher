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
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { apiClient } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { Artwork, User } from '@tastematcher/common';
import { getAIRecommendationsEligibility } from '../../utils/recommendations';
import { ThumbsUp, ThumbsDown, FileText, X, Sparkles } from 'lucide-react';
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
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const LIMIT = 20;

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

    // Reset state when target user changes
    setOffset(0);
    setHasMore(true);
    setRecommendations([]);
    setCommentDrafts({});
    
    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        // @ts-ignore - apiClient might not be typed for extra args yet
        const newRecommendations = await apiClient.getRecommendations(
          user.domainId!,
          targetUserId !== user?.id ? targetUserId : undefined,
          LIMIT,
          0 // Initial offset
        );
        setRecommendations(newRecommendations);
        if (newRecommendations.length < LIMIT) {
          setHasMore(false);
        }
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

  const loadMore = useCallback(async () => {
    if (!targetUserId || !user?.domainId || loading || !hasMore) return;
    
    const nextOffset = offset + LIMIT;
    setLoading(true);
    
    try {
      // @ts-ignore
      const newRecommendations = await apiClient.getRecommendations(
        user.domainId!,
        targetUserId !== user?.id ? targetUserId : undefined,
        LIMIT,
        nextOffset
      );
      
      setRecommendations(prev => [...prev, ...newRecommendations]);
      setOffset(nextOffset);
      
      if (newRecommendations.length < LIMIT) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more AI suggestions', err);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user?.domainId, user?.id, loading, hasMore, offset]);

  // Infinite scroll observer
  useEffect(() => {
    const element = observerTarget.current;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [loadMore, hasMore, loading]);

  const savePreferenceMutation = useSavePreference({
    domainId: user?.domainId!,
    userId: user?.id!,
    onOptimisticUpdate: (artworkId, updates) => {
      setRecommendations((prev) =>
        prev.map((artwork) => {
          if (artwork.id !== artworkId) return artwork;
          const next = { ...artwork };
          if (typeof updates.liked === 'boolean') {
            // @ts-ignore
            next.likedStatus = updates.liked ? 'Liked' : 'Disliked';
          }
          if (updates.comment !== undefined) {
            next.preferenceComment = updates.comment;
          }
          return next;
        })
      );

      setSelectedArtwork((prev) => {
        if (!prev || prev.id !== artworkId) return prev;
        const updated = { ...prev };
        if (typeof updates.liked === 'boolean') {
          // @ts-ignore
          updated.likedStatus = updates.liked ? 'Liked' : 'Disliked';
        }
        if (updates.comment !== undefined) {
          updated.preferenceComment = updates.comment;
        }
        return updated;
      });
    },
  });


  const formatMatchPercentage = (score?: number): string => {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return '0.00%';
    }
    const truncated = Math.floor(score * 10000) / 100;
    return `${truncated.toFixed(2)}%`;
  };

  // Only show full screen loader if we have no data yet
  if (loading && recommendations.length === 0) {
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

  const getDraftComment = (artwork: Artwork) =>
    commentDrafts[artwork.id] ?? artwork.preferenceComment ?? '';

  const handlePreferenceClick = (artwork: Artwork, liked: boolean) => {
    const commentValue = commentDrafts[artwork.id];
    const normalizedComment =
      commentValue !== undefined ? commentValue.trim() : artwork.preferenceComment;
    savePreferenceMutation.mutate({
      artworkId: artwork.id,
      domainId: user?.domainId!,
      liked,
      comment: normalizedComment,
    });
  };

  const handleProposalToggle = (artwork: Artwork) => {
    if (onAddToProposal) {
      onAddToProposal(artwork);
    }
  };

  const handleCommentChange = (artworkId: string, value: string) => {
    setCommentDrafts((prev) => ({ ...prev, [artworkId]: value }));
  };

  const handleCommentSave = async (artwork: Artwork) => {
    if (!user?.domainId) return;
    const commentValue = getDraftComment(artwork);
    const normalizedComment = commentValue.trim();
    const previous = (artwork.preferenceComment ?? '').trim();
    if (previous === normalizedComment) {
      return;
    }
    setSavingCommentId(artwork.id);
    try {
      await savePreferenceMutation.mutateAsync({
        artworkId: artwork.id,
        domainId: user.domainId,
        comment: normalizedComment,
      });
      setCommentDrafts((prev) => ({ ...prev, [artwork.id]: normalizedComment }));
    } finally {
      setSavingCommentId((prev) => (prev === artwork.id ? null : prev));
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
        <>
          <section
            aria-label="AI suggested artworks"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {recommendations.map((item) => {
              const isInProposal = proposalItems?.includes(item.id);

              const commentValue = getDraftComment(item);
              return (
                <article
                  key={item.id}
                  className="group flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300"
                  tabIndex={0}
                  aria-label={`${item.title} - similarity ${formatMatchPercentage(item.probabilityMatch)}`}
                >
                  {/* Header: Match Score */}
                  <div className="px-4 pt-4 pb-2 flex justify-between items-center">
                    {isDomainOwner && (
                      <div className="flex items-center gap-1.5 bg-purple-50 px-2.5 py-1 rounded-full">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-xs font-bold text-purple-700">
                          {formatMatchPercentage(item.probabilityMatch)} Match
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {item.isAuction && (
                        <span className="bg-purple-100 text-purple-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          Auction
                        </span>
                      )}
                      {item.price !== undefined && (item.shouldDisplayPrice ?? true) && (
                        <span className="text-xs font-semibold text-gray-900">
                          ${item.price.toLocaleString()}
                          {item.isAuction && item.maxPrice !== undefined ? ` → $${item.maxPrice.toLocaleString()}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Image */}
                  <div className="relative w-full min-h-[220px] max-h-[320px] bg-gray-100 mx-auto flex items-center justify-center overflow-hidden">
                    <button
                      type="button"
                      className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none flex items-center justify-center"
                      onClick={() => {
                        setSelectedArtwork(item);
                        onArtworkClick?.(item);
                      }}
                      aria-label={`View details for ${item.title}`}
                    >
                      {item.filename ? (
                        <img
                          src={item.filename}
                          alt={item.title}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">No Image</div>
                      )}
                    </button>

                    {/* Proposal Badge */}
                    {isInProposal && (
                      <div className="absolute top-2 left-2 bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-0.5 rounded-full shadow-sm">
                        In Proposal
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col gap-1">
                    <h3 className="font-bold text-lg text-gray-900 line-clamp-1" title={item.title}>
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-1" title={item.artist}>
                      {item.artist}
                    </p>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-auto px-4 pb-4 pt-2 border-t border-gray-50 space-y-3">
                    {readonlyThumbs ? (
                      <div className="text-sm text-gray-600">
                        <p className="uppercase text-xs font-semibold tracking-wider text-gray-500 mb-1">
                          Customer feedback
                        </p>
                        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 min-h-[56px]">
                          {item.preferenceComment && item.preferenceComment.trim().length > 0
                            ? item.preferenceComment
                            : 'No feedback yet.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 inline-flex items-center gap-2">
                          Share feedback
                          {savingCommentId === item.id && (
                            <span className="text-[10px] text-blue-500">Saving…</span>
                          )}
                        </label>
                        <textarea
                          value={commentValue}
                          onChange={(e) => handleCommentChange(item.id, e.target.value)}
                          onBlur={() => handleCommentSave(item)}
                          placeholder="Write a note for your specialist..."
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors min-h-[80px] resize-y"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Notes auto-save when you leave the field.</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={readonlyThumbs}
                          onClick={() => !readonlyThumbs && handlePreferenceClick(item, true)}
                          className={`p-2 rounded-full transition-colors ${item.likedStatus === 'Liked'
                            ? 'bg-green-100 text-green-600'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                            }`}
                          aria-label="Thumbs up"
                        >
                          <ThumbsUp className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          disabled={readonlyThumbs}
                          onClick={() => !readonlyThumbs && handlePreferenceClick(item, false)}
                          className={`p-2 rounded-full transition-colors ${item.likedStatus === 'Disliked'
                            ? 'bg-red-100 text-red-600'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                            }`}
                          aria-label="Thumbs down"
                        >
                          <ThumbsDown className="w-5 h-5" />
                        </button>
                      </div>

                      {onAddToProposal && (
                        <button
                          type="button"
                          onClick={() => handleProposalToggle(item)}
                          className={`p-2 rounded-full transition-colors ${isInProposal
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-blue-600'
                            }`}
                          aria-label={isInProposal ? 'Remove from Proposal' : 'Add to Proposal'}
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Sentinel element for infinite scroll */}
          <div ref={observerTarget} className="h-10 mt-8 flex justify-center items-center">
            {loading && hasMore && (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            )}
          </div>
        </>
      )}

      {eligibility.isEligible && recommendations.length === 0 && !loading && (
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
                <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden flex items-center justify-center">
                  <img
                    src={selectedArtwork.filename}
                    alt={selectedArtwork.title}
                    className="w-full h-full max-h-[24rem] object-contain"
                  />
                </div>
              </div>
              <div className="flex-1 flex flex-col">
                <h2 id="modal-title" className="text-2xl font-bold text-gray-900 mb-2">{selectedArtwork.title}</h2>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-sm text-gray-500">{selectedArtwork.artist}</div>
                  {selectedArtwork.date && <div className="text-sm text-gray-400">• {selectedArtwork.date}</div>}
                </div>

                {selectedArtwork.price !== undefined && (selectedArtwork.shouldDisplayPrice ?? true) && (
                  <div className="text-2xl text-green-700 font-semibold mb-4">${selectedArtwork.price.toLocaleString()}</div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-6 text-sm border-t border-b border-gray-100 py-4">
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Medium</span>
                    <span className="text-gray-900 font-medium">{selectedArtwork.medium || '—'}</span>
                  </div>
                    <div>
                      <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Dimensions</span>
                      <span className="text-gray-900 font-medium">
                        {selectedArtwork.width || selectedArtwork.height || selectedArtwork.depth
                          ? `${selectedArtwork.width ?? '-'} × ${selectedArtwork.height ?? '-'}${selectedArtwork.depth !== undefined ? ` × ${selectedArtwork.depth}` : ''} in`
                          : '—'}
                      </span>
                    </div>
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Signature</span>
                    <span className="text-gray-900 font-medium">{selectedArtwork.signature || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Date</span>
                    <span className="text-gray-900 font-medium">{selectedArtwork.date || '—'}</span>
                  </div>
                </div>

                {selectedArtwork.description && <p className="text-sm text-gray-600 mb-6 leading-relaxed">{selectedArtwork.description}</p>}

                {selectedArtwork.tags && selectedArtwork.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {selectedArtwork.tags.map((t) => (
                      <span key={t} className="px-2.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-medium border border-gray-200">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {!readonlyThumbs ? (
                  <div className="mb-6">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 inline-flex items-center gap-2">
                      Share feedback
                      {savingCommentId === selectedArtwork.id && (
                        <span className="text-[10px] text-blue-500">Saving…</span>
                      )}
                    </label>
                    <textarea
                      value={getDraftComment(selectedArtwork)}
                      onChange={(e) => handleCommentChange(selectedArtwork.id, e.target.value)}
                      onBlur={() => handleCommentSave(selectedArtwork)}
                      placeholder="Let us know what you think about this artwork..."
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors min-h-[100px] resize-y"
                    />
                  </div>
                ) : (
                  <div className="mb-6">
                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Customer feedback
                    </span>
                    <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 min-h-[80px]">
                      {selectedArtwork.preferenceComment && selectedArtwork.preferenceComment.trim().length > 0
                        ? selectedArtwork.preferenceComment
                        : 'No feedback yet.'}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() => handlePreferenceClick(selectedArtwork, true)}
                    aria-label="Like artwork"
                    className={`p-2 rounded-full ${readonlyThumbs ? '' : 'hover:bg-green-100'} ${selectedArtwork.likedStatus === 'Liked' ? 'bg-green-100' : 'bg-gray-100'}`}
                  >
                    <ThumbsUp className={`w-6 h-6 ${readonlyThumbs ? '' : 'hover:text-green-500'} ${selectedArtwork.likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-400'}`} />
                  </button>
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() => handlePreferenceClick(selectedArtwork, false)}
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

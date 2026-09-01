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
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiClient } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import { useViewerPreferences } from "../../contexts/ViewerPreferencesContext";
import { Artwork, User } from "@tastematcher/common";
import {
  AI_RECOMMENDATIONS_MIN_SWIPES,
  getAIRecommendationsEligibility,
  isArtworkNew,
  isAuctionEnded,
} from "../../utils/general";
import {
  ThumbsUp,
  ThumbsDown,
  FileText,
  X,
  Sparkles,
  Gavel,
} from "lucide-react";
import { useSavePreference } from "../../utils/savePreference";
import {
  formatDimensionsForViewer,
  formatPriceRangeForViewer,
} from "../../utils/viewFormatting";
import { AppLoadingState } from "../../components/Loading/AppLoadingState";
import { InfoTooltip } from "../../components/common/InfoTooltip";

interface DomainUserOption {
  id: string;
  label: string;
  onboardingStatus?: User["onboardingStatus"];
  swipeCount?: number;
}

const INCLUDE_RATED_STORAGE_KEY = "tm.aiSuggestions.includeRated";

const readStoredIncludeRated = (defaultValue = false): boolean => {
  try {
    const raw = localStorage.getItem(INCLUDE_RATED_STORAGE_KEY);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
};

const formatScoreComponent = (value: number | undefined): string =>
  `${Math.round((value ?? 0) * 100)}%`;

const RECOMMENDATION_SCORE_TOOLTIP =
  "Image: visual similarity to the customer taste vectors. Intent: match to questionnaire buying interest. Metadata: overlap with artists, mediums, and tags from prior likes/dislikes. Behavior: small recency and auction-status adjustments.";

export const AISuggestionsPage = ({
  domainId,
  userId,
  proposalItems,
  onAddToProposal,
  onArtworkClick,
  readonlyThumbs = false,
  showOwnerRatedFilter = false,
  defaultIncludeRated = false,
}: {
  domainId?: string;
  userId?: string;
  proposalItems?: string[]; // List of artwork IDs already in the proposal
  onAddToProposal?: (artwork: Artwork) => void; // Callback to add artwork to the proposal
  onArtworkClick?: (artwork: Artwork) => void; // Callback to open artwork details
  readonlyThumbs?: boolean;
  showOwnerRatedFilter?: boolean;
  defaultIncludeRated?: boolean;
} = {}) => {
  const { user, stats } = useAuth();
  const { currency, dimensionUnit } = useViewerPreferences();
  const effectiveDomainId = domainId ?? user?.domainId;
  const [recommendations, setRecommendations] = useState<Artwork[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [users, setUsers] = useState<DomainUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [includeRated, setIncludeRated] = useState<boolean>(() =>
    defaultIncludeRated ? true : readStoredIncludeRated(false),
  );
  const observerTarget = useRef<HTMLDivElement>(null);
  const LIMIT = 20;

  const isDomainOwner =
    user?.role === "dealer" ||
    user?.role === "domain_owner" ||
    user?.role === "global_admin";
  const shouldShowOwnerRatedFilter = showOwnerRatedFilter && isDomainOwner;
  const includeRatedForRequest = shouldShowOwnerRatedFilter
    ? includeRated
    : undefined;

  const targetUserId = useMemo(() => {
    return userId ?? user?.id;
  }, [userId, user?.id]);

  const targetUser = useMemo(() => {
    if (userId) {
      return users.find((candidate) => candidate.id === userId);
    }
    if (user?.id && users.length > 0) {
      return users.find((candidate) => candidate.id === user.id) ?? user;
    }
    return user;
  }, [user, users, userId]);

  const targetSwipeCount = useMemo(() => {
    if (!targetUser) return undefined;
    if (targetUser.id === user?.id) {
      return stats?.totalSwiped ?? targetUser.swipeCount ?? user?.swipeCount;
    }
    return targetUser.swipeCount;
  }, [targetUser, user?.id, user?.swipeCount, stats?.totalSwiped]);

  const targetOnboardingStatus = useMemo(() => {
    if (targetUser?.onboardingStatus) return targetUser.onboardingStatus;
    if (targetUserId && targetUserId === user?.id) {
      return user?.onboardingStatus;
    }
    return undefined;
  }, [targetUser, targetUserId, user?.id, user?.onboardingStatus]);

  const canEvaluateEligibility = Boolean(targetOnboardingStatus);

  const eligibility = useMemo(() => {
    if (!canEvaluateEligibility) {
      return { isEligible: true, reasons: [] as string[] };
    }
    return getAIRecommendationsEligibility({
      swipeCount: targetSwipeCount,
      onboardingStatus: targetOnboardingStatus,
    });
  }, [canEvaluateEligibility, targetSwipeCount, targetOnboardingStatus]);

  const localEligibilityNeedsOnboarding =
    canEvaluateEligibility && targetOnboardingStatus !== "completed";
  const localEligibilityNeedsMoreSwipes =
    canEvaluateEligibility &&
    (targetSwipeCount || 0) < AI_RECOMMENDATIONS_MIN_SWIPES;

  useEffect(() => {
    if (!shouldShowOwnerRatedFilter) {
      return;
    }
    try {
      localStorage.setItem(INCLUDE_RATED_STORAGE_KEY, String(includeRated));
    } catch {
      // no-op: storage may be unavailable
    }
  }, [includeRated, shouldShowOwnerRatedFilter]);

  useEffect(() => {
    if (!isDomainOwner || !effectiveDomainId) {
      return;
    }

    const fetchUsers = async () => {
      try {
        const domainUsers = await apiClient.getAllUsers(effectiveDomainId);
        setUsers(
          domainUsers.map((domainUser) => ({
            id: domainUser.id,
            label: domainUser.name ?? domainUser.email ?? domainUser.id,
            onboardingStatus: domainUser.onboardingStatus,
            swipeCount: domainUser.swipeCount,
          })),
        );
      } catch (err) {
        console.error("Failed to load users for AI suggestions", err);
        setError("Unable to load users. Try again later.");
      }
    };

    void fetchUsers();
  }, [isDomainOwner, effectiveDomainId]);

  useEffect(() => {
    if (!targetUserId || !effectiveDomainId) {
      setRecommendations([]);
      setLoading(false);
      return;
    }

    if (canEvaluateEligibility && !eligibility.isEligible) {
      setRecommendations([]);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }

    // Reset state when target user/filter changes.
    setOffset(0);
    setHasMore(true);
    setRecommendations([]);
    setCommentDrafts({});

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const newRecommendations = await apiClient.getRecommendations(
          effectiveDomainId,
          targetUserId !== user?.id ? targetUserId : undefined,
          LIMIT,
          0, // Initial offset
          includeRatedForRequest,
        );
        setRecommendations(newRecommendations);
        if (newRecommendations.length < LIMIT) {
          setHasMore(false);
        }
      } catch (err) {
        console.error("Failed to load AI suggestions", err);
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : "Unable to load AI suggestions. Please try again.";
        setError(errorMessage);
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchRecommendations();
  }, [
    targetUserId,
    effectiveDomainId,
    user?.id,
    canEvaluateEligibility,
    eligibility.isEligible,
    includeRatedForRequest,
  ]);

  const loadMore = useCallback(async () => {
    if (!targetUserId || !effectiveDomainId || loading || !hasMore) return;

    const nextOffset = offset + LIMIT;
    setLoading(true);

    try {
      const newRecommendations = await apiClient.getRecommendations(
        effectiveDomainId,
        targetUserId !== user?.id ? targetUserId : undefined,
        LIMIT,
        nextOffset,
        includeRatedForRequest,
      );

      setRecommendations((prev) => [...prev, ...newRecommendations]);
      setOffset(nextOffset);

      if (newRecommendations.length < LIMIT) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more AI suggestions", err);
    } finally {
      setLoading(false);
    }
  }, [
    targetUserId,
    effectiveDomainId,
    user?.id,
    loading,
    hasMore,
    offset,
    includeRatedForRequest,
  ]);

  // Infinite scroll observer
  useEffect(() => {
    const element = observerTarget.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 },
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
    domainId: effectiveDomainId!,
    userId: user?.id!,
    onOptimisticUpdate: (artworkId, updates) => {
      setRecommendations((prev) =>
        prev.map((artwork) => {
          if (artwork.id !== artworkId) return artwork;
          const next = { ...artwork };
          if (typeof updates.liked === "boolean") {
            // @ts-ignore
            next.likedStatus = updates.liked ? "Liked" : "Disliked";
          }
          if (updates.comment !== undefined) {
            next.preferenceComment = updates.comment;
          }
          return next;
        }),
      );

      setSelectedArtwork((prev) => {
        if (!prev || prev.id !== artworkId) return prev;
        const updated = { ...prev };
        if (typeof updates.liked === "boolean") {
          // @ts-ignore
          updated.likedStatus = updates.liked ? "Liked" : "Disliked";
        }
        if (updates.comment !== undefined) {
          updated.preferenceComment = updates.comment;
        }
        return updated;
      });
    },
  });

  const formatMatchPercentage = (score?: number): string => {
    if (typeof score !== "number" || Number.isNaN(score)) {
      return "0.00%";
    }
    const truncated = Math.floor(score * 10000) / 100;
    return `${truncated.toFixed(2)}%`;
  };

  // Only show full screen loader if we have no data yet
  if (loading && recommendations.length === 0) {
    return <AppLoadingState message="Loading AI suggestions..." fullScreen />;
  }

  const handleCloseModal = () => {
    setSelectedArtwork(null);
  };

  const getDraftComment = (artwork: Artwork) =>
    commentDrafts[artwork.id] ?? artwork.preferenceComment ?? "";

  const handlePreferenceClick = (artwork: Artwork, liked: boolean) => {
    if (!effectiveDomainId) return;
    const commentValue = commentDrafts[artwork.id];
    const normalizedComment =
      commentValue !== undefined
        ? commentValue.trim()
        : artwork.preferenceComment;
    savePreferenceMutation.mutate({
      artworkId: artwork.id,
      domainId: effectiveDomainId,
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
    if (!effectiveDomainId) return;
    const commentValue = getDraftComment(artwork);
    const normalizedComment = commentValue.trim();
    const previous = (artwork.preferenceComment ?? "").trim();
    if (previous === normalizedComment) {
      return;
    }
    setSavingCommentId(artwork.id);
    try {
      await savePreferenceMutation.mutateAsync({
        artworkId: artwork.id,
        domainId: effectiveDomainId,
        comment: normalizedComment,
      });
      setCommentDrafts((prev) => ({
        ...prev,
        [artwork.id]: normalizedComment,
      }));
    } finally {
      setSavingCommentId((prev) => (prev === artwork.id ? null : prev));
    }
  };

  const errorText = (error || "").toLowerCase();
  const eligibilityNeedsOnboarding =
    localEligibilityNeedsOnboarding || errorText.includes("onboarding");
  const eligibilityNeedsMoreSwipes =
    localEligibilityNeedsMoreSwipes ||
    errorText.includes("swipe") ||
    errorText.includes(String(AI_RECOMMENDATIONS_MIN_SWIPES));

  const shouldShowEligibilityCta =
    recommendations.length === 0 &&
    !loading &&
    (eligibilityNeedsOnboarding || eligibilityNeedsMoreSwipes);

  const primaryCta =
    user?.role === "customer"
      ? eligibilityNeedsOnboarding
        ? { to: "/onboarding", label: "Go To Onboarding" }
        : eligibilityNeedsMoreSwipes
          ? { to: "/taster", label: "Go To Taster" }
          : null
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          AI Suggestions
        </h1>
        <p className="text-sm text-gray-600 sm:text-base">
          Discover artworks closely aligned with personal taste profiles.
        </p>
        {shouldShowOwnerRatedFilter && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <input
              id="include-rated-toggle"
              type="checkbox"
              checked={includeRated}
              onChange={(event) => setIncludeRated(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              aria-label="Include rated artworks"
            />
            <label
              htmlFor="include-rated-toggle"
              className="text-sm font-medium text-gray-700"
            >
              Include rated artworks
            </label>
          </div>
        )}
      </header>

      {shouldShowEligibilityCta && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-amber-900">
            AI Suggestions Are Locked For Now
          </h2>
          {eligibilityNeedsOnboarding && (
            <p className="mt-2 text-sm text-amber-800">
              Complete onboarding to unlock personalized recommendations.
            </p>
          )}
          {!eligibilityNeedsOnboarding && eligibilityNeedsMoreSwipes && (
            <p className="mt-2 text-sm text-amber-800">
              You need at least {AI_RECOMMENDATIONS_MIN_SWIPES} swipes in Taster
              before AI Suggestions can load.
            </p>
          )}
          {eligibilityNeedsOnboarding && eligibilityNeedsMoreSwipes && (
            <p className="mt-1 text-xs text-amber-700">
              After onboarding, continue swiping in Taster to reach{" "}
              {AI_RECOMMENDATIONS_MIN_SWIPES} swipes.
            </p>
          )}
          {primaryCta ? (
            <div className="mt-4">
              <Link
                to={primaryCta.to}
                className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {primaryCta.label}
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-amber-800">
              This customer must complete onboarding and/or Taster swipes before
              recommendations can be generated.
            </p>
          )}
        </section>
      )}

      {error && !shouldShowEligibilityCta && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
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
              const auctionEnded = isAuctionEnded(item);
              const proposalActionDisabled = auctionEnded && !isInProposal;
              const showNewTag = isArtworkNew(item);

              const commentValue = getDraftComment(item);
              return (
                <article
                  key={item.id}
                  className={`group flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 ${auctionEnded ? "opacity-60" : ""}`}
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
                        <span className="inline-flex items-center gap-1.5 bg-blue-900/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          <Gavel className="w-3 h-3" />
                          Auction
                        </span>
                      )}
                      {auctionEnded && (
                        <span className="bg-gray-200 text-gray-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          Ended
                        </span>
                      )}
                      {item.price !== undefined &&
                        (user?.role !== "customer" ||
                          (item.shouldDisplayPrice ?? true)) && (
                          <span className="text-xs font-semibold text-gray-900">
                            {formatPriceRangeForViewer(
                              item.price,
                              item.isAuction ? item.maxPrice : undefined,
                              currency,
                            )}
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
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          No Image
                        </div>
                      )}
                    </button>

                    {/* Proposal Badge */}
                    {isInProposal && (
                      <div className="absolute top-2 left-2 bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-0.5 rounded-full shadow-sm">
                        In Proposal
                      </div>
                    )}
                    {showNewTag && (
                      <div className="absolute top-2 right-2 bg-sky-200/90 backdrop-blur-sm text-sky-900 text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm">
                        New
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col gap-2">
                    <h3
                      className="font-bold text-lg text-gray-900 line-clamp-1"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="text-sm text-gray-500 line-clamp-1"
                      title={item.artist}
                    >
                      {item.artist}
                    </p>
                    {isDomainOwner && item.recommendationScore && (
                      <div
                        className="mt-2 rounded-lg border border-purple-100 bg-purple-50/70 p-3 text-xs text-purple-950"
                        aria-label={`Recommendation reasoning for ${item.title}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-semibold">Score breakdown</span>
                          <InfoTooltip
                            ariaLabel="Explain AI recommendation score categories"
                            message={RECOMMENDATION_SCORE_TOOLTIP}
                            buttonClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-purple-300 text-[10px] font-semibold text-purple-700 transition-colors hover:border-purple-500 hover:text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
                            tooltipClassName="pointer-events-none absolute right-0 top-full z-30 mt-1 w-72 rounded-md bg-gray-900 px-3 py-2 text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                          />
                        </div>
                        <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1">
                          <div>
                            <span className="font-semibold">Image</span>{" "}
                            {formatScoreComponent(
                              item.recommendationScore.imageSimilarity,
                            )}
                          </div>
                          <div>
                            <span className="font-semibold">Intent</span>{" "}
                            {formatScoreComponent(
                              item.recommendationScore.intentScore,
                            )}
                          </div>
                          <div>
                            <span className="font-semibold">Metadata</span>{" "}
                            {formatScoreComponent(
                              item.recommendationScore.metadataScore,
                            )}
                          </div>
                          <div>
                            <span className="font-semibold">Behavior</span>{" "}
                            {formatScoreComponent(
                              item.recommendationScore.behaviorScore,
                            )}
                          </div>
                        </div>
                        {item.recommendationScore.reasons.length > 0 && (
                          <ul className="list-disc space-y-0.5 pl-4">
                            {item.recommendationScore.reasons
                              .slice(0, 3)
                              .map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-auto px-4 pb-4 pt-2 border-t border-gray-50 space-y-3">
                    {readonlyThumbs ? (
                      <div className="text-sm text-gray-600">
                        <p className="uppercase text-xs font-semibold tracking-wider text-gray-500 mb-1">
                          Customer feedback
                        </p>
                        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 min-h-[56px]">
                          {item.preferenceComment &&
                          item.preferenceComment.trim().length > 0
                            ? item.preferenceComment
                            : "No feedback yet."}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 inline-flex items-center gap-2">
                          Share feedback
                          {savingCommentId === item.id && (
                            <span className="text-[10px] text-blue-500">
                              Saving…
                            </span>
                          )}
                        </label>
                        <textarea
                          value={commentValue}
                          onChange={(e) =>
                            handleCommentChange(item.id, e.target.value)
                          }
                          onBlur={() => handleCommentSave(item)}
                          placeholder="Write a note for your specialist..."
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors min-h-[80px] resize-y"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Notes auto-save when you leave the field.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={readonlyThumbs}
                          onClick={() =>
                            !readonlyThumbs && handlePreferenceClick(item, true)
                          }
                          className={`p-2 rounded-full transition-colors ${
                            item.likedStatus === "Liked"
                              ? "bg-green-100 text-green-600"
                              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          }`}
                          aria-label="Thumbs up"
                        >
                          <ThumbsUp className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          disabled={readonlyThumbs}
                          onClick={() =>
                            !readonlyThumbs &&
                            handlePreferenceClick(item, false)
                          }
                          className={`p-2 rounded-full transition-colors ${
                            item.likedStatus === "Disliked"
                              ? "bg-red-100 text-red-600"
                              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          }`}
                          aria-label="Thumbs down"
                        >
                          <ThumbsDown className="w-5 h-5" />
                        </button>
                      </div>

                      {onAddToProposal && (
                        <button
                          type="button"
                          disabled={proposalActionDisabled}
                          onClick={() => {
                            if (!proposalActionDisabled) {
                              handleProposalToggle(item);
                            }
                          }}
                          className={`p-2 rounded-full transition-colors ${
                            isInProposal
                              ? "bg-blue-100 text-blue-600"
                              : proposalActionDisabled
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                          }`}
                          aria-label={
                            isInProposal
                              ? "Remove from Proposal"
                              : "Add to Proposal"
                          }
                          aria-disabled={proposalActionDisabled}
                          title={
                            proposalActionDisabled ? "Auction ended" : undefined
                          }
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
          <div
            ref={observerTarget}
            className="h-10 mt-8 flex justify-center items-center"
          >
            {loading && hasMore && (
              <AppLoadingState
                message="Loading more suggestions..."
                compact
                iconSize="sm"
              />
            )}
          </div>
        </>
      )}

      {eligibility.isEligible &&
        recommendations.length === 0 &&
        !loading &&
        !shouldShowEligibilityCta && (
          <p className="py-12 text-center text-gray-600">
            No AI suggestions yet. Encourage additional tasting activity to
            enrich personalization.
          </p>
        )}

      {/* Modal for artwork details */}
      {selectedArtwork && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={handleCloseModal}
        >
          <div
            className="relative w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 shadow-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] sm:p-6"
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
                <h2
                  id="modal-title"
                  className="text-2xl font-bold text-gray-900 mb-2"
                >
                  {selectedArtwork.title}
                </h2>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-sm text-gray-500">
                    {selectedArtwork.artist}
                  </div>
                  {selectedArtwork.date && (
                    <div className="text-sm text-gray-400">
                      • {selectedArtwork.date}
                    </div>
                  )}
                </div>

                {selectedArtwork.price !== undefined &&
                  (user?.role !== "customer" ||
                    (selectedArtwork.shouldDisplayPrice ?? true)) && (
                    <div className="text-2xl text-green-700 font-semibold mb-4">
                      {formatPriceRangeForViewer(
                        selectedArtwork.price,
                        selectedArtwork.isAuction
                          ? selectedArtwork.maxPrice
                          : undefined,
                        currency,
                      )}
                    </div>
                  )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-6 text-sm border-t border-b border-gray-100 py-4">
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Medium
                    </span>
                    <span className="text-gray-900 font-medium">
                      {selectedArtwork.medium || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Dimensions
                    </span>
                    <span className="text-gray-900 font-medium">
                      {formatDimensionsForViewer(
                        selectedArtwork.width,
                        selectedArtwork.height,
                        selectedArtwork.depth,
                        dimensionUnit,
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Signature
                    </span>
                    <span className="text-gray-900 font-medium">
                      {selectedArtwork.signature || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Date
                    </span>
                    <span className="text-gray-900 font-medium">
                      {selectedArtwork.date || "—"}
                    </span>
                  </div>
                </div>

                {selectedArtwork.description && (
                  <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    {selectedArtwork.description}
                  </p>
                )}

                {selectedArtwork.tags && selectedArtwork.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {selectedArtwork.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-medium border border-gray-200"
                      >
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
                        <span className="text-[10px] text-blue-500">
                          Saving…
                        </span>
                      )}
                    </label>
                    <textarea
                      value={getDraftComment(selectedArtwork)}
                      onChange={(e) =>
                        handleCommentChange(selectedArtwork.id, e.target.value)
                      }
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
                      {selectedArtwork.preferenceComment &&
                      selectedArtwork.preferenceComment.trim().length > 0
                        ? selectedArtwork.preferenceComment
                        : "No feedback yet."}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() => handlePreferenceClick(selectedArtwork, true)}
                    aria-label="Like artwork"
                    className={`p-2 rounded-full ${readonlyThumbs ? "" : "hover:bg-green-100"} ${selectedArtwork.likedStatus === "Liked" ? "bg-green-100" : "bg-gray-100"}`}
                  >
                    <ThumbsUp
                      className={`w-6 h-6 ${readonlyThumbs ? "" : "hover:text-green-500"} ${selectedArtwork.likedStatus === "Liked" ? "text-green-500" : "text-gray-400"}`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={readonlyThumbs}
                    onClick={() =>
                      handlePreferenceClick(selectedArtwork, false)
                    }
                    aria-label="Dislike artwork"
                    className={`p-2 rounded-full ${readonlyThumbs ? "" : "hover:bg-red-100"} ${selectedArtwork.likedStatus === "Disliked" ? "bg-red-100" : "bg-gray-100"}`}
                  >
                    <ThumbsDown
                      className={`w-6 h-6 ${readonlyThumbs ? "" : "hover:text-red-500"} ${selectedArtwork.likedStatus === "Disliked" ? "text-red-500" : "text-gray-400"}`}
                    />
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

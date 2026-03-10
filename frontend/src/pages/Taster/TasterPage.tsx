// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: responsive (mobile + desktop), smooth, accessible (WCAG AA).
// -----------------------------------------------------------

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { Artwork } from "@tastematcher/common";
import { ThumbsUp, ThumbsDown, ChevronLeft, ChevronRight } from "lucide-react";
import { apiClient } from "../../utils/api";
import { getAIRecommendationsEligibility, isArtworkNew } from "../../utils/general";
import "./TasterPage.css";

type SwipeDirection = "left" | "right" | null;

/**
 * Taster page with Tinder-style swipe interface for artwork preferences.
 * Supports touch gestures, keyboard controls, and button clicks.
 * Only shows artworks the user hasn't rated yet.
 */
export function TasterPage() {
  const BATCH_SIZE = 20;
  const PREFETCH_THRESHOLD = 10;
  const { user, incrementSwipeCount, stats } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [showAiUnlockModal, setShowAiUnlockModal] = useState(false);
  const hasShownUnlockRef = useRef(false);
  const previousTotalSwipedRef = useRef<number | null>(null);
  const loadedImageUrlsRef = useRef<Set<string>>(new Set());
  const imagePreloadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const [queuedArtworks, setQueuedArtworks] = useState<Artwork[]>([]);
  const [isFetchingNextBatch, setIsFetchingNextBatch] = useState(false);
  const [hasMoreUntasted, setHasMoreUntasted] = useState(true);
  const [isCurrentImageReady, setIsCurrentImageReady] = useState(true);

  // Fetch untasted artworks for the user
  const { data: untastedData, isLoading } = useQuery({
    queryKey: ["untasted-artworks", user?.domainId, user?.id],
    queryFn: async () => {
      if (!user?.domainId || !user?.id)
        throw new Error("User not authenticated");
      return apiClient.fetchUntastedArtworks(user.domainId, user.id, BATCH_SIZE);
    },
    enabled: !!user?.domainId && !!user?.id,
    // Always refresh when entering Taster to avoid replaying previously swiped cards
    staleTime: 0,
    refetchOnMount: "always",
    gcTime: 0,
  });

  useEffect(() => {
    setCurrentIndex(0);
    setQueuedArtworks([]);
    setHasMoreUntasted(true);
    setIsFetchingNextBatch(false);
  }, [user?.id, user?.domainId]);

  useEffect(() => {
    const incomingArtworks = untastedData?.artworks ?? [];
    setQueuedArtworks((prev) => {
      if (prev.length === 0) {
        return [...incomingArtworks];
      }

      const existingIds = new Set(prev.map((artwork) => artwork.id));
      const uniqueIncoming = incomingArtworks.filter(
        (artwork) => artwork?.id && !existingIds.has(artwork.id),
      );
      if (uniqueIncoming.length === 0) {
        return prev;
      }
      return [...prev, ...uniqueIncoming];
    });
    setHasMoreUntasted(incomingArtworks.length > 0);
  }, [untastedData]);

  const artworks = useMemo(() => queuedArtworks, [queuedArtworks]);
  const currentArtwork = artworks[currentIndex];
  const hasMoreInQueue = currentIndex < artworks.length - 1;
  const tasterEligibility = useMemo(() => {
    const effectiveUser = user
      ? {
          swipeCount: stats?.totalSwiped ?? user.swipeCount,
          onboardingStatus: user.onboardingStatus,
        }
      : null;
    if (!effectiveUser) {
      return { isEligible: false, reasons: [] as string[] };
    }
    return getAIRecommendationsEligibility(effectiveUser);
  }, [user, stats?.totalSwiped]);

  const getArtworkImageUrl = useCallback((artwork?: Artwork): string => {
    if (!artwork) return "";
    return artwork.thumbnails?.[1]?.url || artwork.filename || "";
  }, []);

  const preloadImage = useCallback((src: string): Promise<void> => {
    if (!src) return Promise.resolve();
    if (loadedImageUrlsRef.current.has(src)) {
      return Promise.resolve();
    }

    const inFlight = imagePreloadPromisesRef.current.get(src);
    if (inFlight) return inFlight;

    const promise = new Promise<void>((resolve) => {
      const img = new Image();

      const done = () => {
        loadedImageUrlsRef.current.add(src);
        imagePreloadPromisesRef.current.delete(src);
        resolve();
      };

      img.onload = done;
      img.onerror = done;
      img.src = src;
    });

    imagePreloadPromisesRef.current.set(src, promise);
    return promise;
  }, []);

  const currentImageUrl = useMemo(
    () => getArtworkImageUrl(currentArtwork),
    [currentArtwork, getArtworkImageUrl],
  );

  // Save preference mutation
  const savePreference = useMutation({
    mutationFn: async ({
      artworkId,
      liked,
      artworkDomainId,
    }: {
      artworkId: string;
      liked: boolean;
      artworkDomainId?: string;
    }) => {
      if (!user?.domainId || !user?.id)
        throw new Error("User not authenticated");

      await apiClient.saveArtworkPreference(user.domainId, user.id, {
        domainId: artworkDomainId ?? "00000000-0000-0000-0000-000000000000",
        artworkId,
        liked,
      });
    },
    onSuccess: () => {
      // Manually update stats in context to reflect the swipe immediately
      incrementSwipeCount();

      // Invalidate stats to update home page
      queryClient.invalidateQueries({
        queryKey: ["artwork-stats", user?.domainId],
      });
    },
    onError: (error) => {
      console.error("Failed to save preference:", error);
      // TODO: Show error toast to user
    },
  });

  useEffect(() => {
    if (stats?.totalSwiped === undefined || stats?.totalSwiped === null) {
      return;
    }

    if (previousTotalSwipedRef.current === null) {
      previousTotalSwipedRef.current = stats.totalSwiped;
      return;
    }

    const prev = previousTotalSwipedRef.current;
    if (stats.totalSwiped >= 20 && prev < 20 && !hasShownUnlockRef.current) {
      hasShownUnlockRef.current = true;
      setShowAiUnlockModal(true);
    }
    previousTotalSwipedRef.current = stats.totalSwiped;
  }, [stats?.totalSwiped]);

  useEffect(() => {
    if (!currentImageUrl) {
      setIsCurrentImageReady(true);
      return;
    }

    if (loadedImageUrlsRef.current.has(currentImageUrl)) {
      setIsCurrentImageReady(true);
      return;
    }

    let isActive = true;
    setIsCurrentImageReady(false);
    void preloadImage(currentImageUrl).then(() => {
      if (isActive) {
        setIsCurrentImageReady(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, [currentImageUrl, preloadImage]);

  useEffect(() => {
    const upcoming = [currentIndex + 1, currentIndex + 2, currentIndex + 3]
      .map((index) => artworks[index])
      .filter(Boolean)
      .map((artwork) => getArtworkImageUrl(artwork))
      .filter(Boolean);

    for (const src of upcoming) {
      void preloadImage(src);
    }
  }, [artworks, currentIndex, getArtworkImageUrl, preloadImage]);

  // Handle swipe decision
  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (!currentArtwork || swipeDirection || !isCurrentImageReady) return;

      setSwipeDirection(direction);
      savePreference.mutate({
        artworkId: currentArtwork.id,
        liked: direction === "right",
        artworkDomainId: currentArtwork.domainId,
      });

      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setSwipeDirection(null);
        setDragOffset({ x: 0, y: 0 });
      }, 300);
    },
    [currentArtwork, swipeDirection, savePreference, isCurrentImageReady],
  );

  // Mouse/touch drag handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    setDragStart({ x: clientX, y: clientY });
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!dragStart) return;

    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handleDragEnd = () => {
    if (!dragStart) return;

    const threshold = 100;
    if (Math.abs(dragOffset.x) > threshold) {
      handleSwipe(dragOffset.x > 0 ? "right" : "left");
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
    setDragStart(null);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSwipe("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSwipe("right");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSwipe]);

  // Prefetch next batch before queue exhaustion so users don't see an empty gap.
  useEffect(() => {
    const domainId = user?.domainId;
    const userId = user?.id;
    if (!domainId || !userId) return;

    const remainingInQueue = artworks.length - currentIndex;
    if (
      artworks.length === 0 ||
      remainingInQueue > PREFETCH_THRESHOLD ||
      isLoading ||
      isFetchingNextBatch ||
      !hasMoreUntasted
    ) {
      return;
    }

    setIsFetchingNextBatch(true);
    (async () => {
      try {
        const nextBatch = await apiClient.fetchUntastedArtworks(
          domainId,
          userId,
          BATCH_SIZE,
        );
        const nextBatchArtworks = nextBatch.artworks ?? [];

        if (nextBatchArtworks.length === 0) {
          setHasMoreUntasted(false);
          return;
        }

        setQueuedArtworks((prev) => {
          const existingIds = new Set(prev.map((artwork) => artwork.id));
          const newArtworks = nextBatchArtworks.filter(
            (artwork) => artwork?.id && !existingIds.has(artwork.id),
          );
          if (newArtworks.length === 0) {
            setHasMoreUntasted(false);
            return prev;
          }
          return [...prev, ...newArtworks];
        });
      } catch {
        // Keep current queue on transient errors.
      } finally {
        setIsFetchingNextBatch(false);
      }
    })();
  }, [
    PREFETCH_THRESHOLD,
    BATCH_SIZE,
    artworks.length,
    currentIndex,
    hasMoreUntasted,
    isFetchingNextBatch,
    isLoading,
    user?.domainId,
    user?.id,
  ]);

  const isInitialLoading = isLoading && artworks.length === 0;
  const isQueueExhausted = artworks.length > 0 && currentIndex >= artworks.length;
  const isWaitingForMore = isQueueExhausted && (isFetchingNextBatch || hasMoreUntasted);

  if (isInitialLoading || isWaitingForMore) {
    return (
      <div
        className="taster-page taster-page--loading"
        role="status"
        aria-live="polite"
      >
        <p>{isInitialLoading ? "Loading artworks..." : "Loading more artworks..."}</p>
      </div>
    );
  }

  if (!artworks || artworks.length === 0) {
    return (
      <div className="taster-page taster-page--empty">
        <div className="taster-empty">
          <ThumbsUp className="taster-empty__icon" aria-hidden="true" />
          <h2 className="taster-empty__title">No Untasted Artworks</h2>
          <p className="taster-empty__description">
            You've already rated all available artworks! Upload more to continue
            building your taste profile.
          </p>
        </div>
      </div>
    );
  }

  if (!hasMoreUntasted && currentIndex >= artworks.length) {
    return (
      <div className="taster-page taster-page--complete">
        <div className="taster-complete">
          <ThumbsUp className="taster-complete__icon" aria-hidden="true" />
          <h2 className="taster-complete__title">All Done!</h2>
          <p className="taster-complete__description">
            You've rated all available artworks. Great job building your taste
            profile!
          </p>
        </div>
      </div>
    );
  }

  const rotation = dragOffset.x * 0.05;
  const opacity = 1 - Math.abs(dragOffset.x) / 300;
  const showNewTag = currentArtwork ? isArtworkNew(currentArtwork) : false;
  const nextArtwork = hasMoreInQueue ? artworks[currentIndex + 1] : undefined;
  const nextImageUrl = getArtworkImageUrl(nextArtwork);

  return (
    <div className="taster-page">
      {showAiUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Congratulations!
            </h2>
            <p className="text-gray-600 mb-4">
              {tasterEligibility.isEligible
                ? "You’ve completed 20 swipes and unlocked the AI Suggestions section. Head over to explore personalized recommendations."
                : "You’ve completed 20 swipes. To unlock AI Suggestions, complete onboarding first."}
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={() => setShowAiUnlockModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <header className="taster-header">
        <h1 className="taster-title">Taster</h1>
        <p className="taster-subtitle">Swipe right to like, left to dislike</p>
      </header>

      <div className="taster-container">
        {/* Card stack */}
        <div className="taster-stack">
          {currentArtwork && (
            <div
              ref={cardRef}
              className={`taster-card ${swipeDirection ? `taster-card--swiping-${swipeDirection}` : ""}`}
              style={{
                transform: `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`,
                opacity,
              }}
              onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
              onMouseMove={(e) =>
                dragStart && handleDragMove(e.clientX, e.clientY)
              }
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={(e) =>
                handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
              }
              onTouchMove={(e) =>
                dragStart &&
                handleDragMove(e.touches[0].clientX, e.touches[0].clientY)
              }
              onTouchEnd={handleDragEnd}
              role="img"
              aria-label={currentArtwork.title}
            >
              <div className="taster-card__header">
                <h2 className="taster-card__title">{currentArtwork.title}</h2>
                {currentArtwork.artist && (
                  <p className="taster-card__artist">{currentArtwork.artist}</p>
                )}
              </div>

              <div className="taster-card__media">
                <img
                  key={`${currentArtwork.id}:${currentImageUrl}`}
                  src={currentImageUrl}
                  alt={currentArtwork.title}
                  className="taster-card__image"
                  draggable="false"
                  onLoad={() => {
                    if (currentImageUrl) {
                      loadedImageUrlsRef.current.add(currentImageUrl);
                    }
                    setIsCurrentImageReady(true);
                  }}
                  onError={() => {
                    setIsCurrentImageReady(true);
                  }}
                  style={{ opacity: isCurrentImageReady ? 1 : 0 }}
                />
                {!isCurrentImageReady && (
                  <div className="taster-card__image-loading" aria-live="polite">
                    Loading image...
                  </div>
                )}
                {showNewTag && (
                  <div className="taster-card__new-badge">New</div>
                )}

                {/* Swipe indicators moved inside image container */}
                <div className="taster-card__indicator taster-card__indicator--like">
                  <ThumbsUp aria-hidden="true" />
                  <span>LIKE</span>
                </div>
                <div className="taster-card__indicator taster-card__indicator--dislike">
                  <ThumbsDown aria-hidden="true" />
                  <span>NOPE</span>
                </div>
              </div>

              <div className="taster-card__info" />
            </div>
          )}

          {/* Next card preview */}
          {hasMoreInQueue && nextArtwork && (
            <div className="taster-card taster-card--next">
              <img
                src={nextImageUrl}
                alt=""
                className="taster-card__image"
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div
          className="taster-actions"
          role="group"
          aria-label="Rating actions"
        >
          <button
            type="button"
            className="taster-action taster-action--dislike"
            onClick={() => handleSwipe("left")}
            disabled={!currentArtwork || !!swipeDirection || !isCurrentImageReady}
            aria-label="Dislike this artwork (left arrow key)"
          >
            <ThumbsDown aria-hidden="true" />
          </button>

          <button
            type="button"
            className="taster-action taster-action--like"
            onClick={() => handleSwipe("right")}
            disabled={!currentArtwork || !!swipeDirection || !isCurrentImageReady}
            aria-label="Like this artwork (right arrow key)"
          >
            <ThumbsUp aria-hidden="true" />
          </button>
        </div>

        {/* Keyboard hint */}
        <div className="taster-hint" aria-live="polite" aria-atomic="true">
          <span className="taster-hint__key">
            <ChevronLeft aria-hidden="true" /> ←
          </span>
          <span className="taster-hint__text">Dislike</span>
          <span className="taster-hint__separator">•</span>
          <span className="taster-hint__text">Like</span>
          <span className="taster-hint__key">
            → <ChevronRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

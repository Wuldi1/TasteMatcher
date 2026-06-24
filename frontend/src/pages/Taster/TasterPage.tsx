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
import { AppLoadingState } from "../../components/Loading/AppLoadingState";
import "./TasterPage.css";

type SwipeDirection = "left" | "right" | null;
type DragPoint = { x: number; y: number };

const SWIPE_THRESHOLD_PX = 100;

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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
  const latestDragOffsetRef = useRef<DragPoint>({ x: 0, y: 0 });
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

      activePointerIdRef.current = null;
      dragStartRef.current = null;
      latestDragOffsetRef.current = { x: 0, y: 0 };
      setIsDragging(false);
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

  const resetDrag = useCallback(() => {
    activePointerIdRef.current = null;
    dragStartRef.current = null;
    latestDragOffsetRef.current = { x: 0, y: 0 };
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  const canStartDrag =
    !!currentArtwork && !swipeDirection && isCurrentImageReady;

  const startDrag = useCallback((clientX: number, clientY: number) => {
    dragStartRef.current = { x: clientX, y: clientY };
    latestDragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(true);
  }, []);

  const updateDragOffset = useCallback((clientX: number, clientY: number) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;

    const nextOffset = {
      x: clientX - dragStart.x,
      y: clientY - dragStart.y,
    };
    latestDragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }, []);

  const commitDrag = useCallback(() => {
    const finalOffset = latestDragOffsetRef.current;
    activePointerIdRef.current = null;
    dragStartRef.current = null;
    latestDragOffsetRef.current = { x: 0, y: 0 };
    setIsDragging(false);

    if (Math.abs(finalOffset.x) > SWIPE_THRESHOLD_PX) {
      handleSwipe(finalOffset.x > 0 ? "right" : "left");
      return;
    }

    setDragOffset({ x: 0, y: 0 });
  }, [handleSwipe]);

  // Pointer drag handlers cover mouse, touch, and pen input with one path.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      !canStartDrag ||
      (e.pointerType === "mouse" &&
        typeof e.button === "number" &&
        e.button !== 0)
    ) {
      return;
    }

    e.preventDefault();
    activePointerIdRef.current = e.pointerId;
    startDrag(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateDragOffset(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    e.preventDefault();
    updateDragOffset(e.clientX, e.clientY);
    const pointerId = e.pointerId;
    commitDrag();
    e.currentTarget.releasePointerCapture?.(pointerId);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    resetDrag();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      !canStartDrag ||
      activePointerIdRef.current !== null ||
      (typeof e.button === "number" && e.button !== 0)
    ) {
      return;
    }

    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.preventDefault();
    updateDragOffset(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.preventDefault();
    updateDragOffset(e.clientX, e.clientY);
    commitDrag();
  };

  const handleMouseLeave = () => {
    if (!dragStartRef.current) return;
    commitDrag();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!canStartDrag || activePointerIdRef.current !== null || !touch) return;
    startDrag(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!dragStartRef.current || !touch) {
      return;
    }
    e.preventDefault();
    updateDragOffset(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    if (!dragStartRef.current) return;
    commitDrag();
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
      >
        <AppLoadingState
          message={
            isInitialLoading ? "Loading artworks..." : "Loading more artworks..."
          }
          compact
        />
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
  const opacity = Math.max(0.2, 1 - Math.abs(dragOffset.x) / 300);
  const showNewTag = currentArtwork ? isArtworkNew(currentArtwork) : false;
  const nextArtwork = hasMoreInQueue ? artworks[currentIndex + 1] : undefined;
  const nextImageUrl = getArtworkImageUrl(nextArtwork);
  const dragDirection =
    isDragging && Math.abs(dragOffset.x) > 20
      ? dragOffset.x > 0
        ? "right"
        : "left"
      : null;

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
              className={[
                "taster-card",
                isDragging ? "taster-card--dragging" : "",
                dragDirection ? `taster-card--dragging-${dragDirection}` : "",
                swipeDirection
                  ? `taster-card--swiping-${swipeDirection}`
                  : "",
              ].join(" ")}
              style={{
                transform: `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`,
                opacity,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={resetDrag}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
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

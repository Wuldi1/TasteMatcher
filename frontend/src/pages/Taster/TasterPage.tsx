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

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { Heart, X, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../../services/api';
import { saveArtworkPreference } from '../../services/artworksApi';
import './TasterPage.css';

type SwipeDirection = 'left' | 'right' | null;

/**
 * Taster page with Tinder-style swipe interface for artwork preferences.
 * Supports touch gestures, keyboard controls, and button clicks.
 * Only shows artworks the user hasn't rated yet.
 */
export function TasterPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch untasted artworks for the user
  const { data: untastedData, isLoading } = useQuery({
    queryKey: ['untasted-artworks', user?.domainId, user?.id],
    queryFn: async () => {
      if (!user?.domainId || !user?.id) throw new Error('User not authenticated');
      return apiClient.fetchUntastedArtworks(user.domainId, user.id, 20);
    },
    enabled: !!user?.domainId && !!user?.id,
    staleTime: 60000, // Cache for 1 minute
  });

  // Extract artworks array from response with fallback to empty array
  const artworks = untastedData?.artworks || [];
  const currentArtwork = artworks[currentIndex];
  const hasMore = currentIndex < artworks.length - 1;

  // Save preference mutation
  const savePreference = useMutation({
    mutationFn: async ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      if (!user?.domainId || !user?.id) throw new Error('User not authenticated');
      
      console.log(`Saving preference: ${artworkId} - ${liked ? 'liked' : 'disliked'}`);
      
      await saveArtworkPreference(user.domainId, user.id, {
        artworkId,
        liked,
      });
    },
    onSuccess: () => {
      // Invalidate stats to update home page
      queryClient.invalidateQueries({ queryKey: ['artwork-stats', user?.domainId] });
    },
    onError: (error) => {
      console.error('Failed to save preference:', error);
      // TODO: Show error toast to user
    },
  });

  // Handle swipe decision
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (!currentArtwork || swipeDirection) return;

    setSwipeDirection(direction);
    savePreference.mutate({ artworkId: currentArtwork.id, liked: direction === 'right' });

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }, 300);
  }, [currentArtwork, swipeDirection, savePreference]);

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
      handleSwipe(dragOffset.x > 0 ? 'right' : 'left');
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
    setDragStart(null);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSwipe('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSwipe('right');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSwipe]);

  const handleReset = () => {
    setCurrentIndex(0);
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
    // Refetch untasted artworks
    queryClient.invalidateQueries({ queryKey: ['untasted-artworks', user?.domainId, user?.id] });
  };

  if (isLoading) {
    return (
      <div className="taster-page taster-page--loading" role="status" aria-live="polite">
        <p>Loading artworks...</p>
      </div>
    );
  }

  if (!artworks || artworks.length === 0) {
    return (
      <div className="taster-page taster-page--empty">
        <div className="taster-empty">
          <Heart className="taster-empty__icon" aria-hidden="true" />
          <h2 className="taster-empty__title">No Untasted Artworks</h2>
          <p className="taster-empty__description">
            You've already rated all available artworks! Upload more to continue building your taste profile.
          </p>
        </div>
      </div>
    );
  }

  if (!hasMore && currentIndex >= artworks.length) {
    return (
      <div className="taster-page taster-page--complete">
        <div className="taster-complete">
          <Heart className="taster-complete__icon" aria-hidden="true" />
          <h2 className="taster-complete__title">All Done!</h2>
          <p className="taster-complete__description">
            You've rated all available artworks. Great job building your taste profile!
          </p>
          <button
            type="button"
            className="taster-complete__button"
            onClick={handleReset}
            aria-label="Check for new artworks"
          >
            <RotateCcw aria-hidden="true" />
            Check for New Artworks
          </button>
        </div>
      </div>
    );
  }

  const rotation = dragOffset.x * 0.05;
  const opacity = 1 - Math.abs(dragOffset.x) / 300;

  return (
    <div className="taster-page">
      <header className="taster-header">
        <h1 className="taster-title">Taster</h1>
        <p className="taster-subtitle">
          Swipe right to like, left to dislike • {currentIndex + 1} / {artworks.length}
        </p>
      </header>

      <div className="taster-container">
        {/* Card stack */}
        <div className="taster-stack">
          {currentArtwork && (
            <div
              ref={cardRef}
              className={`taster-card ${swipeDirection ? `taster-card--swiping-${swipeDirection}` : ''}`}
              style={{
                transform: `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`,
                opacity,
              }}
              onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
              onMouseMove={(e) => dragStart && handleDragMove(e.clientX, e.clientY)}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchMove={(e) => dragStart && handleDragMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={handleDragEnd}
              role="img"
              aria-label={currentArtwork.title}
            >
              <img
                src={currentArtwork.thumbnails?.[1]?.url || currentArtwork.filename}
                alt={currentArtwork.title}
                className="taster-card__image"
                draggable="false"
              />
              <div className="taster-card__info">
                <h2 className="taster-card__title">{currentArtwork.title}</h2>
                {currentArtwork.artist && (
                  <p className="taster-card__artist">by {currentArtwork.artist}</p>
                )}
              </div>

              {/* Swipe indicators */}
              <div className="taster-card__indicator taster-card__indicator--like">
                <Heart aria-hidden="true" />
                <span>LIKE</span>
              </div>
              <div className="taster-card__indicator taster-card__indicator--dislike">
                <X aria-hidden="true" />
                <span>NOPE</span>
              </div>
            </div>
          )}

          {/* Next card preview */}
          {hasMore && artworks[currentIndex + 1] && (
            <div className="taster-card taster-card--next">
              <img
                src={artworks[currentIndex + 1].thumbnails?.[1]?.url || artworks[currentIndex + 1].filename}
                alt=""
                className="taster-card__image"
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="taster-actions" role="group" aria-label="Rating actions">
          <button
            type="button"
            className="taster-action taster-action--dislike"
            onClick={() => handleSwipe('left')}
            disabled={!currentArtwork || !!swipeDirection}
            aria-label="Dislike this artwork (left arrow key)"
          >
            <X aria-hidden="true" />
          </button>

          <button
            type="button"
            className="taster-action taster-action--like"
            onClick={() => handleSwipe('right')}
            disabled={!currentArtwork || !!swipeDirection}
            aria-label="Like this artwork (right arrow key)"
          >
            <Heart aria-hidden="true" />
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

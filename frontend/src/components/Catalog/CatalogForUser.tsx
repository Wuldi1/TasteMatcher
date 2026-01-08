import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../utils/api";
import type { Artwork } from "@tastematcher/common";
import {
  FileText,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Trash2,
  Sparkles,
  Lock,
} from "lucide-react";

const PAGE_SIZE = 30;

export type CatalogForUserProps = {
  domainId: string;
  userId?: string; // optional target user for liked/disliked status
  preferenceFilter?: "liked" | "disliked";
  onArtworkClick?: (a: Artwork) => void;
  onAddToDraft?: (a: Artwork) => void;
  onEditClick?: (a: Artwork, e: React.MouseEvent) => void;
  onDeleteClick?: (a: Artwork, e: React.MouseEvent) => void;
  onPreferenceClick?: (
    artworkId: string,
    liked: boolean,
    e?: React.MouseEvent
  ) => void;
  showPreferenceButtons?: boolean; // actionable thumbs for customer
  showReadOnlyThumbs?: boolean; // show thumbs as indicators (non-actionable)
  ownersExperience?: boolean; // alias for showReadOnlyThumbs (backwards compat)
  isInProposal?: (artworkId: string) => boolean; // Function to check if artwork is in a proposal
};

export default function CatalogForUser({
  domainId,
  userId,
  preferenceFilter,
  onArtworkClick,
  onAddToDraft,
  onEditClick,
  onDeleteClick,
  onPreferenceClick,
  showPreferenceButtons = false,
  showReadOnlyThumbs = false,
  ownersExperience = false,
  isInProposal,
}: CatalogForUserProps) {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, boolean | undefined>
  >({});
  const [continuationToken, setContinuationToken] = useState<string | null>(
    null
  );
  const [hasMore, setHasMore] = useState<boolean>(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const mergeFeedback = useCallback((items: Artwork[]) => {
    if (!items?.length) return;
    setFeedbackMap((prev) => {
      const next = { ...prev };
      items.forEach((a) => {
        if ((a as Artwork & { liked?: boolean }).liked === true)
          next[a.id] = true;
        if ((a as Artwork & { liked?: boolean }).liked === false)
          next[a.id] = false;
        if ((a as Artwork & { likedStatus?: string }).likedStatus === "Liked")
          next[a.id] = true;
        if (
          (a as Artwork & { likedStatus?: string }).likedStatus === "Disliked"
        )
          next[a.id] = false;
      });
      return next;
    });
  }, []);

  const fetchInitial = useCallback(async () => {
    if (!domainId) return;
    setInitialLoading(true);
    setError(null);
    try {
      const response = await apiClient.getArtworks(domainId, {
        limit: PAGE_SIZE,
        userId,
        preference: preferenceFilter,
      });
      const items = response.items ?? [];
      setArtworks(items);
      mergeFeedback(items);
      const nextToken = response.continuationToken ?? null;
      setContinuationToken(nextToken);
      setHasMore(Boolean(response.hasMore || nextToken));
    } catch (err) {
      console.error("CatalogForUser: failed to load artworks", err);
      setArtworks([]);
      setError("Failed to load artworks");
      setHasMore(false);
    } finally {
      setInitialLoading(false);
    }
  }, [domainId, userId, preferenceFilter, mergeFeedback]);

  const fetchNextPage = useCallback(async () => {
    if (!domainId || !hasMore || !continuationToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await apiClient.getArtworks(domainId, {
        limit: PAGE_SIZE,
        userId,
        continuationToken: continuationToken || undefined,
        preference: preferenceFilter,
      });
      const items = response.items ?? [];
      if (items.length > 0) {
        setArtworks((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const merged = [...prev];
          items.forEach((item) => {
            if (!existingIds.has(item.id)) {
              merged.push(item);
            }
          });
          return merged;
        });
        mergeFeedback(items);
      }
      const nextToken = response.continuationToken ?? null;
      setContinuationToken(nextToken);
      setHasMore(Boolean(response.hasMore || nextToken));
    } catch (err) {
      console.error("CatalogForUser: failed to load more artworks", err);
      if (!artworks.length) {
        setError("Failed to load artworks");
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    domainId,
    userId,
    preferenceFilter,
    hasMore,
    continuationToken,
    isLoadingMore,
    mergeFeedback,
    artworks.length,
  ]);

  useEffect(() => {
    if (!domainId) return;
    setArtworks([]);
    setFeedbackMap({});
    setContinuationToken(null);
    setHasMore(false);
    fetchInitial();
  }, [domainId, userId, preferenceFilter, fetchInitial]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      {
        rootMargin: "200px",
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, fetchNextPage]);

  const visible = artworks;

  if (initialLoading) return <div>Loading catalog...</div>;
  if (error && visible.length === 0)
    return <div className="text-red-600">{error}</div>;
  if (!initialLoading && visible.length === 0) return <div>No artworks</div>;

  // Decide whether to show thumbs and whether they are actionable
  const showReadOnly = showReadOnlyThumbs || ownersExperience;
  const showThumbs = showPreferenceButtons || showReadOnly;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
        {visible.map((artwork) => {
          const likedStatus =
            artwork.likedStatus ??
            (feedbackMap[artwork.id] === true
              ? "Liked"
              : feedbackMap[artwork.id] === false
                ? "Disliked"
                : "NotTasted");
          const inProposal = isInProposal?.(artwork.id) ?? false;

          return (
            <article key={artwork.id} className="flex flex-col gap-3 group">
              {/* Image Container */}
              <div className="relative w-full min-h-[220px] max-h-[320px] overflow-hidden rounded-2xl bg-gray-100 shadow-sm transition-all duration-300 group-hover:shadow-md flex items-center justify-center">
                <button
                  type="button"
                  className="absolute inset-0 z-0 w-full h-full cursor-pointer focus:outline-none flex items-center justify-center"
                  onClick={() => onArtworkClick?.(artwork)}
                  aria-label={`View details for ${artwork.title}`}
                >
                  {artwork.filename ? (
                    <img
                      src={artwork.filename}
                      alt={artwork.title}
                      className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                </button>

                {/* Price Badge */}
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                  {artwork.isAuction && (
                    <span className="bg-purple-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                      Auction
                    </span>
                  )}
                  {artwork.price !== undefined &&
                    (artwork.shouldDisplayPrice ?? true) && (
                      <div className="bg-white/90 backdrop-blur-sm text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        ${artwork.price.toLocaleString()}
                        {artwork.isAuction && artwork.maxPrice !== undefined
                          ? ` → $${artwork.maxPrice.toLocaleString()}`
                          : ""}
                      </div>
                    )}
                </div>

                {/* Proposal Badge */}
                {inProposal && (
                  <div className="absolute top-3 left-3 z-10 bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
                    In Proposal
                  </div>
                )}

                {artwork.useForTaster && (
                  <div className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-purple-600/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                    <Sparkles className="w-4 h-4" />
                    Taster
                  </div>
                )}
                {artwork.isPrivate && (
                  <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-gray-900/85 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                    <Lock className="w-3.5 h-3.5" />
                    Private
                  </div>
                )}
              </div>

              {/* Info & Actions Footer */}
              <div className="flex items-start justify-between gap-4 px-1">
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-semibold text-gray-900 truncate leading-tight"
                    title={artwork.title}
                  >
                    {artwork.title}
                  </h3>
                  <p
                    className="text-sm text-gray-500 truncate mt-0.5"
                    title={artwork.artist}
                  >
                    {artwork.artist}
                  </p>
                  {(artwork.width || artwork.height || artwork.depth) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {artwork.width ?? "-"} × {artwork.height ?? "-"}
                      {artwork.depth !== undefined
                        ? ` × ${artwork.depth}`
                        : ""}{" "}
                      in
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {showThumbs ? (
                    showPreferenceButtons ? (
                      // Actionable buttons for customers
                      <>
                        <button
                          type="button"
                          disabled={showReadOnly}
                          onClick={(e) => {
                            e.stopPropagation();
                            !showReadOnly &&
                              onPreferenceClick?.(artwork.id, true, e);
                          }}
                          className={`p-2 rounded-full transition-colors ${
                            artwork.likedStatus === "Liked"
                              ? "bg-green-100 text-green-600"
                              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          }`}
                          aria-label="Thumbs up"
                          tabIndex={showReadOnly ? -1 : 0}
                        >
                          <ThumbsUp className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          disabled={showReadOnly}
                          onClick={(e) => {
                            e.stopPropagation();
                            !showReadOnly &&
                              onPreferenceClick?.(artwork.id, false, e);
                          }}
                          className={`p-2 rounded-full transition-colors ${
                            artwork.likedStatus === "Disliked"
                              ? "bg-red-100 text-red-600"
                              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          }`}
                          aria-label="Thumbs down"
                          tabIndex={showReadOnly ? -1 : 0}
                        >
                          <ThumbsDown className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      // Read-only indicator
                      <div className="flex gap-2 px-2 py-1">
                        <ThumbsUp
                          className={`w-5 h-5 ${likedStatus === "Liked" ? "text-green-500" : "text-gray-300"}`}
                        />
                        <ThumbsDown
                          className={`w-5 h-5 ${likedStatus === "Disliked" ? "text-red-500" : "text-gray-300"}`}
                        />
                      </div>
                    )
                  ) : null}

                  {onAddToDraft && (
                    <button
                      type="button"
                      aria-label={
                        isInProposal?.(artwork.id)
                          ? "Remove from Proposal"
                          : "Add to Proposal"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToDraft(artwork);
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isInProposal?.(artwork.id)
                          ? "bg-blue-100 text-blue-600"
                          : "text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                  )}

                  {onEditClick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditClick(artwork, e);
                      }}
                      aria-label="Edit"
                      className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                  )}
                  {onDeleteClick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteClick(artwork, e);
                      }}
                      aria-label="Delete"
                      className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {showReadOnly && (
                <div className="px-1">
                  <div className="mt-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Customer feedback
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {artwork.preferenceComment &&
                      artwork.preferenceComment.trim().length > 0
                        ? artwork.preferenceComment
                        : "No feedback yet."}
                    </p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {isLoadingMore && hasMore && (
        <div className="py-4 text-center text-sm text-gray-500">
          Loading more artworks...
        </div>
      )}
      {hasMore && <div ref={loadMoreRef} className="h-4" />}
    </>
  );
}

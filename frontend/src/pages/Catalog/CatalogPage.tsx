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

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { Search, X, Heart, Trash2, Edit, HeartOff } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { fetchArtworks, updateArtwork, toggleArtworkLike, deleteArtwork } from '../../api/artworks';
import { EditArtworkModal } from '../../components/EditArtworkModal/EditArtworkModal';
import './CatalogPage.css';

/**
 * Catalog page displaying all uploaded artworks in a responsive grid.
 * Features: lazy loading, search/filter, edit, like, delete operations.
 */
export function CatalogPage() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);

  // Debug logging to check auth state
  console.log('CatalogPage render:', { 
    user, 
    domainId: user?.domainId, 
    authLoading,
    isEnabled: !!user?.domainId && !authLoading
  });

  // Debug: Force log on every render
  console.log('[CatalogPage] Render state:', { 
    hasUser: !!user,
    userId: user?.id,
    domainId: user?.domainId,
    authLoading,
    queryEnabled: !!user?.domainId,
  });

  // Fetch artworks with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: queryLoading,
    error,
    isFetching,
    status,
  } = useInfiniteQuery({
    queryKey: ['artworks', user?.domainId, searchQuery],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      console.log('[Query] Executing queryFn:', { 
        domainId: user?.domainId, 
        pageParam, 
        searchQuery 
      });

      if (!user?.domainId) {
        throw new Error('No domain ID');
      }
      
      const result = await fetchArtworks(user.domainId, {
        limit: 20,
        continuationToken: pageParam,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        searchQuery: searchQuery || undefined,
      });

      console.log('[Query] Results:', { 
        itemCount: result.items?.length, 
        hasMore: result.hasMore,
      });

      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuationToken,
    enabled: !!user?.domainId, // Simplified condition
    staleTime: 30000,
    retry: 2,
  });

  // Debug query state
  console.log('[Query] State:', { 
    status,
    queryLoading,
    isFetching,
    error: error?.message,
    dataPages: data?.pages?.length,
    totalItems: data?.pages.flatMap(p => p.items || []).length,
    enabled: !!user?.domainId && !authLoading,
  });

  const allArtworks = data?.pages.flatMap((page) => page.items || []) || [];

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      if (!user?.domainId || !user?.id) throw new Error('Not authenticated');
      return toggleArtworkLike(user.domainId, artworkId, user.id, liked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (artworkId: string) => {
      if (!user?.domainId) throw new Error('No domain ID');
      return deleteArtwork(user.domainId, artworkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
      setSelectedArtwork(null);
    },
  });

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleArtworkClick = (artwork: Artwork) => {
    setSelectedArtwork(artwork);
  };

  const handleCloseModal = () => {
    setSelectedArtwork(null);
  };

  const handleEditClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingArtwork(artwork);
  };

  const handleLikeClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    likeMutation.mutate({ artworkId: artwork.id, liked: true });
  };

  const handleDeleteClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${artwork.title}"?`)) {
      deleteMutation.mutate(artwork.id);
    }
  };

  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <h1 className="catalog-title">Artwork Catalog</h1>
        
        {/* Search bar */}
        <div className="catalog-search">
          <label htmlFor="catalog-search-input" className="sr-only">
            Search artworks
          </label>
          <div className="catalog-search__wrapper">
            <Search className="catalog-search__icon" aria-hidden="true" />
            <input
              id="catalog-search-input"
              type="text"
              className="catalog-search__input"
              placeholder="Search artworks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search artworks"
            />
            {searchQuery && (
              <button
                type="button"
                className="catalog-search__clear"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Gallery grid */}
      {authLoading || queryLoading ? (
        <div className="catalog-loading" role="status" aria-live="polite">
          <p>{authLoading ? 'Authenticating...' : 'Loading artworks...'}</p>
        </div>
      ) : error ? (
        <div className="catalog-error" role="alert">
          <p>Error loading artworks: {error.message}</p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['artworks'] })}
            className="catalog-retry-button"
          >
            Retry
          </button>
        </div>
      ) : allArtworks.length === 0 ? (
        <div className="catalog-empty" role="status">
          <p>No artworks found. Start by uploading some!</p>
          {user?.domainId && (
            <p className="catalog-debug">Domain ID: {user.domainId}</p>
          )}
        </div>
      ) : (
        <>
          <div className="catalog-grid" role="list">
            {allArtworks.map((artwork) => (
              <div
                key={artwork.id}
                className="catalog-item"
                role="listitem"
              >
                <button
                  type="button"
                  className="catalog-item__image-wrapper"
                  onClick={() => handleArtworkClick(artwork)}
                  aria-label={`View ${artwork.title}`}
                >
                  <img
                    src={artwork.thumbnails?.[0]?.url || artwork.filename}
                    alt={artwork.title}
                    className="catalog-item__image"
                    loading="lazy"
                  />
                  <div className="catalog-item__overlay">
                    <span className="catalog-item__title">{artwork.title}</span>
                    {artwork.artist && (
                      <span className="catalog-item__artist">{artwork.artist}</span>
                    )}
                  </div>
                </button>

                {/* Action buttons */}
                <div className="catalog-item__actions">
                  <button
                    type="button"
                    className="catalog-item__action catalog-item__action--edit"
                    onClick={(e) => handleEditClick(artwork, e)}
                    aria-label="Edit artwork"
                    title="Edit"
                  >
                    <Edit aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="catalog-item__action catalog-item__action--like"
                    onClick={(e) => handleLikeClick(artwork, e)}
                    aria-label="Like artwork"
                    title="Like"
                  >
                    <Heart aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="catalog-item__action catalog-item__action--delete"
                    onClick={(e) => handleDeleteClick(artwork, e)}
                    aria-label="Delete artwork"
                    title="Delete"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Load more button */}
          {hasNextPage && (
            <div className="catalog-load-more">
              <button
                type="button"
                className="catalog-load-more__button"
                onClick={handleLoadMore}
                disabled={isFetchingNextPage}
                aria-label="Load more artworks"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Full-size modal */}
      {selectedArtwork && (
        <div
          className="catalog-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={handleCloseModal}
        >
          <div className="catalog-modal__content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="catalog-modal__close"
              onClick={handleCloseModal}
              aria-label="Close modal"
            >
              <X aria-hidden="true" />
            </button>
            <img
              src={selectedArtwork.thumbnails?.[2]?.url || selectedArtwork.filename}
              alt={selectedArtwork.title}
              className="catalog-modal__image"
            />
            <div className="catalog-modal__info">
              <h2 id="modal-title" className="catalog-modal__title">
                {selectedArtwork.title}
              </h2>
              {selectedArtwork.artist && (
                <p className="catalog-modal__artist">by {selectedArtwork.artist}</p>
              )}
              {selectedArtwork.description && (
                <p className="catalog-modal__description">{selectedArtwork.description}</p>
              )}
              {selectedArtwork.tags && selectedArtwork.tags.length > 0 && (
                <div className="catalog-modal__tags">
                  {selectedArtwork.tags.map((tag) => (
                    <span key={tag} className="catalog-modal__tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingArtwork && (
        <EditArtworkModal
          artwork={editingArtwork}
          onClose={() => setEditingArtwork(null)}
          onSave={() => {
            setEditingArtwork(null);
            queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
          }}
        />
      )}
    </div>
  );
}

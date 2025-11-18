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
import { Search, X, Trash2, Edit, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { apiClient } from '../../services/api';
import { EditArtworkModal } from '../../components/EditArtworkModal/EditArtworkModal';
import './CatalogPage.css';

/**
 * Catalog page displaying all uploaded artworks in a responsive grid.
 * Features: lazy loading, search/filter, edit, delete operations.
 */
export function CatalogPage() {
  const { user, isInitializing: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState<string>('');
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
    queryKey: ['artworks', user?.domainId, searchQuery, sortBy, sortOrder, filterBy],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      console.log('[Query] Executing queryFn:', { 
        domainId: user?.domainId, 
        pageParam, 
        searchQuery,
        sortBy,
        sortOrder,
        filterBy
      });

      if (!user?.domainId) {
        throw new Error('No domain ID');
      }
      
      const result = await apiClient.getArtworks(user.domainId, {
        limit: 20,
        continuationToken: pageParam,
        sortBy,
        sortOrder,
        filterBy: filterBy || undefined,
      });

      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuationToken,
    enabled: !!user?.domainId,
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

  // Filter artworks by search query (client-side)
  const filteredArtworks = searchQuery
    ? allArtworks.filter((artwork) => {
        const query = searchQuery.toLowerCase();
        return (
          artwork.title?.toLowerCase().includes(query) ||
          artwork.artist?.toLowerCase().includes(query) ||
          artwork.description?.toLowerCase().includes(query) ||
          artwork.classification?.toLowerCase().includes(query) ||
          artwork.department?.toLowerCase().includes(query) ||
          artwork.tags?.some(tag => tag.toLowerCase().includes(query))
        );
      })
    : allArtworks;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (artworkId: string) => {
      if (!user?.domainId) throw new Error('No domain ID');
      return apiClient.deleteArtwork(user.domainId, artworkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
      setSelectedArtwork(null);
    },
  });

  // Add mutation for saving preferences (like/dislike)
  const savePreferenceMutation = useMutation({
    mutationFn: async ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      if (!user?.domainId || !user?.id) throw new Error('User not authenticated');
      return apiClient.saveArtworkPreference(user.domainId, user.id, { artworkId, liked });
    },
    onMutate: async ({ artworkId, liked }) => {
      // Optionally optimistic update for modal if open
      await queryClient.cancelQueries({ queryKey: ['artworks', user?.domainId] });
      const previous = queryClient.getQueriesData(['artworks', user?.domainId]);

      // update selectedArtwork locally for immediate feedback
      if (selectedArtwork && selectedArtwork.id === artworkId) {
        setSelectedArtwork({
          ...selectedArtwork,
          // @ts-ignore - frontend expects likedStatus string ('Liked'|'Disliked'|'NotTasted')
          likedStatus: liked ? 'Liked' : 'Disliked',
        });
      }

      return { previous };
    },
    onError: (_err, _variables, context) => {
      // revert if needed - simple approach: invalidate to refetch the truth
      if (context?.previous) {
        queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
      }
    },
    onSuccess: () => {
      // Refresh artworks so lists show updated status
      queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
      // Invalidate untasted as well to keep Taster in sync
      queryClient.invalidateQueries({ queryKey: ['untasted-artworks', user?.domainId, user?.id] });
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

  const handleDeleteClick = (artwork: Artwork, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${artwork.title}"?`)) {
      deleteMutation.mutate(artwork.id);
    }
  };

  // Handler to like/dislike from catalog or modal
  const handlePreferenceClick = (artworkId: string, liked: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user || user.role !== 'customer') return;
    if (savePreferenceMutation.isLoading) return;
    savePreferenceMutation.mutate({ artworkId, liked });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="catalog-page">
        <header className="catalog-header">
          <h1 className="catalog-title">Artwork Catalog</h1>
          
          {/* Search and Filter Bar */}
          <div className="catalog-controls">
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

            {/* Sort and Filter Controls */}
            <div className="catalog-filters">
              <div className="catalog-filter-group">
                <label htmlFor="sort-by" className="catalog-filter-label">
                  Sort By
                </label>
                <select
                  id="sort-by"
                  className="catalog-filter-select"
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order as 'asc' | 'desc');
                  }}
                >
                  <optgroup label="Date Added">
                    <option value="createdAt-desc">Newest First</option>
                    <option value="createdAt-asc">Oldest First</option>
                  </optgroup>
                  <optgroup label="Title">
                    <option value="title-asc">A → Z</option>
                    <option value="title-desc">Z → A</option>
                  </optgroup>
                  <optgroup label="Artist">
                    <option value="artist-asc">A → Z</option>
                    <option value="artist-desc">Z → A</option>
                  </optgroup>
                  <optgroup label="Date Created">
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                  </optgroup>
                </select>
              </div>

              <div className="catalog-filter-group">
                <label htmlFor="filter-classification" className="catalog-filter-label">
                  Classification
                </label>
                <select
                  id="filter-classification"
                  className="catalog-filter-select"
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="classification:Painting">Paintings</option>
                  <option value="classification:Sculpture">Sculptures</option>
                  <option value="classification:Photography">Photography</option>
                  <option value="classification:Drawing">Drawings</option>
                  <option value="classification:Print">Prints</option>
                  <option value="classification:Codices">Codices</option>
                </select>
              </div>

              <div className="catalog-filter-group">
                <label htmlFor="filter-department" className="catalog-filter-label">
                  Department
                </label>
                <select
                  id="filter-department"
                  className="catalog-filter-select"
                  value={filterBy.startsWith('department:') ? filterBy : ''}
                  onChange={(e) => setFilterBy(e.target.value)}
                >
                  <option value="">All Departments</option>
                  <option value="department:Modern">Modern Art</option>
                  <option value="department:Islamic">Islamic Art</option>
                  <option value="department:Asian">Asian Art</option>
                  <option value="department:European">European Art</option>
                  <option value="department:American">American Art</option>
                </select>
              </div>
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
        ) : filteredArtworks.length === 0 ? (
          <div className="catalog-empty" role="status">
            <p>No artworks found{searchQuery ? ' matching your search' : ''}. {!searchQuery && 'Start by uploading some!'}</p>
          </div>
        ) : (
          <>
            <div className="catalog-grid" role="list">
              {filteredArtworks.map((artwork) => {
                const likedStatus = artwork.likedStatus ?? 'NotTasted';
                const isCustomer = user?.role === 'customer';

                return (
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

                  {/* Action buttons + customer thumbs */}
                  <div className="catalog-item__actions">
                    {isCustomer && (
                      <div className="catalog-item__preference flex items-center gap-2 mr-2" aria-hidden="true">
                        <button
                          type="button"
                          onClick={(e) => handlePreferenceClick(artwork.id, true, e)}
                          className="p-1"
                          aria-label={`Like ${artwork.title}`}
                          title="Like"
                        >
                          <ThumbsUp
                            className={`w-5 h-5 ${likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-400'}`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handlePreferenceClick(artwork.id, false, e)}
                          className="p-1"
                          aria-label={`Dislike ${artwork.title}`}
                          title="Dislike"
                        >
                          <ThumbsDown
                            className={`w-5 h-5 ${likedStatus === 'Disliked' ? 'text-red-500' : 'text-gray-400'}`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Owner/manager actions (edit/delete) */}
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
                      className="catalog-item__action catalog-item__action--delete"
                      onClick={(e) => handleDeleteClick(artwork, e)}
                      aria-label="Delete artwork"
                      title="Delete"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )})}
            </div>

            {/* Load more button */}
            {hasNextPage && !searchQuery && (
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
                {selectedArtwork.date && (
                  <p className="catalog-modal__date">{selectedArtwork.date}</p>
                )}
                {selectedArtwork.description && (
                  <p className="catalog-modal__description">{selectedArtwork.description}</p>
                )}

                {/* Customer actionable thumbs inside modal */}
                {user?.role === 'customer' && (
                  <div className="catalog-modal__preference mt-4 flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => handlePreferenceClick(selectedArtwork.id, true)}
                      aria-label="Like artwork"
                      className="p-2"
                      disabled={savePreferenceMutation.isLoading}
                    >
                      <ThumbsUp
                        className={`w-6 h-6 ${selectedArtwork.likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-400'}`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePreferenceClick(selectedArtwork.id, false)}
                      aria-label="Dislike artwork"
                      className="p-2"
                      disabled={savePreferenceMutation.isLoading}
                    >
                      <ThumbsDown
                        className={`w-6 h-6 ${selectedArtwork.likedStatus === 'Disliked' ? 'text-red-500' : 'text-gray-400'}`}
                      />
                    </button>
                  </div>
                )}

                {/* Metadata badges */}
                {(selectedArtwork.classification || selectedArtwork.department || selectedArtwork.country) && (
                  <div className="catalog-modal__metadata">
                    {selectedArtwork.classification && (
                      <span className="catalog-modal__badge catalog-modal__badge--classification">
                        {selectedArtwork.classification}
                      </span>
                    )}
                    {selectedArtwork.department && (
                      <span className="catalog-modal__badge catalog-modal__badge--department">
                        {selectedArtwork.department}
                      </span>
                    )}
                    {selectedArtwork.country && (
                      <span className="catalog-modal__badge catalog-modal__badge--country">
                        {selectedArtwork.country}
                      </span>
                    )}
                  </div>
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
    </div>
  );
}

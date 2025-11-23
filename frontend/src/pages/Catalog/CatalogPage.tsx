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
import { Search, X, ThumbsUp, ThumbsDown, Edit, Trash2 } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { apiClient } from '../../utils/api';
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

  // Fetch artworks with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: queryLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['artworks', user?.domainId, searchQuery, sortBy, sortOrder],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      if (!user?.domainId) {
        throw new Error('No domain ID');
      }
      const result = await apiClient.getArtworks(user.domainId, {
        limit: 20,
        continuationToken: pageParam,
        sortBy,
        sortOrder,
      });
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // Defensive: lastPage may be undefined or not an object
      if (!lastPage || typeof lastPage !== 'object' || !('continuationToken' in lastPage)) return undefined;
      return lastPage.continuationToken ?? undefined;
    },
    enabled: !!user?.domainId,
    staleTime: 30000,
    retry: 2,
  });

  // Defensive: flatten pages only if data.pages is an array
  const allArtworks = Array.isArray(data?.pages)
    ? data.pages.flatMap((page) => Array.isArray(page?.items) ? page.items : [])
    : [];

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

  // Replace custom hook with local mutation that performs a safe optimistic update
  const savePreferenceMutation = useMutation({
    mutationFn: async ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      if (!user?.domainId || !user?.id) throw new Error('User not authenticated');
      return apiClient.saveArtworkPreference(user.domainId, user.id, {
        domainId: user.domainId,
        artworkId,
        liked,
      });
    },
    // Optimistic update
    onMutate: async ({ artworkId, liked }: { artworkId: string; liked: boolean }) => {
      const queryKey = ['artworks', user?.domainId, searchQuery, sortBy, sortOrder];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData(queryKey);

      // Defensive clone
      let newData: any = undefined;
      try {
        newData = previousData ? JSON.parse(JSON.stringify(previousData)) : previousData;
      } catch {
        newData = previousData;
      }

      if (newData && Array.isArray(newData.pages)) {
        newData.pages = newData.pages.map((page: any) => ({
          ...page,
          items: Array.isArray(page?.items)
            ? page.items.map((it: any) =>
                it?.id === artworkId ? { ...it, likedStatus: liked ? 'Liked' : 'Disliked' } : it
              )
            : page.items,
        }));
        queryClient.setQueryData(queryKey, newData);
      }

      // Optimistically update selectedArtwork if it's open
      const prevSelected = selectedArtwork;
      if (prevSelected && prevSelected.id === artworkId) {
        setSelectedArtwork({ ...prevSelected, likedStatus: liked ? 'Liked' : 'Disliked' });
      }

      return { previousData, prevSelected };
    },
    onError: (err, variables, context: any) => {
      const queryKey = ['artworks', user?.domainId, searchQuery, sortBy, sortOrder];
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      // rollback selected artwork
      if (context?.prevSelected) {
        setSelectedArtwork(context.prevSelected);
      }
      console.error('Failed saving preference', err);
    },
    onSettled: () => {
      // Refetch to ensure cache normalization
      queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] });
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ['artworks', user?.domainId] })}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredArtworks.map((artwork) => (
                <div
                  key={artwork.id}
                  className="border rounded overflow-hidden bg-white shadow-sm flex flex-col h-full"
                >
                  <button
                    type="button"
                    className="block w-full h-40 bg-gray-100 overflow-hidden"
                    onClick={() => handleArtworkClick(artwork)}
                    aria-label={`Open artwork ${artwork.title ?? artwork.id}`}
                  >
                    {artwork.filename ? (
                      <img src={artwork.filename} alt={artwork.title} className="object-cover w-full h-full" />
                    ) : (
                      <div className="text-sm text-gray-500 p-4 h-full flex items-center justify-center">No image</div>
                    )}
                  </button>

                  <div className="p-3 flex flex-col flex-1">
                    <div className="text-sm font-semibold truncate">{artwork.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{artwork.artist}</div>
                    {artwork.price !== undefined && (
                      <div className="text-xs text-green-700 mt-1 font-semibold">${artwork.price.toLocaleString()}</div>
                    )}

                    <div className="flex-1" />
                    {/* Spacer to push buttons to bottom */}

                    <div className="mt-3 flex items-center justify-between">
                      {/* Thumbs Up/Down for customers */}
                      {user?.role === 'customer' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handlePreferenceClick(artwork.id, true, e)}
                            aria-label={`Like ${artwork.title}`}
                            className={`p-2 rounded-full ${artwork.likedStatus === 'Liked'
                              ? 'hover:bg-green-300'
                              : 'hover:bg-green-200'
                              }`}
                            disabled={savePreferenceMutation.isPending}
                          >
                            <ThumbsUp
                              className={`w-5 h-5 hover:text-green-500 ${artwork.likedStatus === 'Liked' ? 'text-green-600' : 'text-gray-300'
                                }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handlePreferenceClick(artwork.id, false, e)}
                            aria-label={`Dislike ${artwork.title}`}
                            className={`p-2 rounded-full ${artwork.likedStatus === 'Disliked'
                              ? 'hover:bg-red-300'
                              : 'hover:bg-red-200'
                              }`}
                            disabled={savePreferenceMutation.isPending}
                          >
                            <ThumbsDown
                              className={`w-5 h-5 hover:text-red-500 ${artwork.likedStatus === 'Disliked' ? 'text-red-600' : 'text-gray-300'
                                }`}
                            />
                          </button>
                        </div>
                      )}

                      {/* Edit/Delete for non-customers */}
                      {/* Move to bottom right, styled like thumbs */}
                    </div>
                    {user?.role !== 'customer' && (
                      <div className="flex justify-end mt-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleEditClick(artwork, e)}
                            aria-label="Edit"
                            className="p-2 rounded-full hover:bg-blue-200"
                          >
                            <Edit className="w-5 h-5 text-blue-600" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(artwork, e)}
                            aria-label="Delete"
                            className="p-2 rounded-full hover:bg-red-200"
                          >
                            <Trash2 className="w-5 h-5 text-red-600" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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

        {/* Redesigned Full-size modal */}
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
              {/* Close Button */}
              <button
                type="button"
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                onClick={handleCloseModal}
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col md:flex-row gap-6">
                {/* Artwork Image */}
                <div className="flex-shrink-0 w-full md:w-1/2">
                  <img
                    src={selectedArtwork.thumbnails?.[2]?.url || selectedArtwork.filename}
                    alt={selectedArtwork.title}
                    className="rounded-lg object-cover w-full h-96"
                  />
                </div>

                {/* Artwork Details */}
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

                  {/* Metadata */}
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

                  {/* Thumbs Up/Down */}
                  {user?.role === 'customer' && (
                    <div className="mt-4 flex items-center justify-center gap-6">
                      <button
                        type="button"
                        onClick={() => handlePreferenceClick(selectedArtwork.id, true)}
                        aria-label="Like artwork"
                        className={`p-2 rounded-full ${selectedArtwork.likedStatus === 'Liked' ? 'hover:bg-green-300' : 'hover:bg-green-200'}`}
                        disabled={savePreferenceMutation.isPending}
                      >
                        <ThumbsUp
                          className={`w-6 h-6 ${selectedArtwork.likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-400'
                            }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePreferenceClick(selectedArtwork.id, false)}
                        aria-label="Dislike artwork"
                        className={`p-2 rounded-full ${selectedArtwork.likedStatus === 'Disliked' ? 'hover:bg-red-300' : 'hover:bg-red-200'}`}
                        disabled={savePreferenceMutation.isPending}
                      >
                        <ThumbsDown
                          className={`w-6 h-6 hover:text-red-500 ${selectedArtwork.likedStatus === 'Disliked' ? 'text-red-500' : 'text-gray-400'
                            }`}
                        />
                        </button>
                      </div>
                  )}

                  {/* Actions (restricted for customers) */}
                  {user?.role !== 'customer' && (
                    <div className="mt-auto flex items-center gap-4">
                      <button
                        type="button"
                        onClick={(e) => handleEditClick(selectedArtwork, e)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        aria-label="Edit artwork"
                      >
                        <Edit className="w-5 h-5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(selectedArtwork, e)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        aria-label="Delete artwork"
                      >
                        <Trash2 className="w-5 h-5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
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

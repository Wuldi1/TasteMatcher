import React, { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import type { Artwork } from '@tastematcher/common';
import { FileText, ThumbsUp, ThumbsDown, Edit, Trash2 } from 'lucide-react';

export type CatalogForUserProps = {
    domainId: string;
    userId?: string; // optional target user for liked/disliked status
    hasFeedback?: boolean; // show only artworks with feedback
    onArtworkClick?: (a: Artwork) => void;
    onAddToDraft?: (a: Artwork) => void;
    onEditClick?: (a: Artwork, e: React.MouseEvent) => void;
    onDeleteClick?: (a: Artwork, e: React.MouseEvent) => void;
    onPreferenceClick?: (artworkId: string, liked: boolean, e?: React.MouseEvent) => void;
    showPreferenceButtons?: boolean; // actionable thumbs for customer
    showReadOnlyThumbs?: boolean; // show thumbs as indicators (non-actionable)
    ownersExperience?: boolean; // alias for showReadOnlyThumbs (backwards compat)
    isInProposal?: (artworkId: string) => boolean; // Function to check if artwork is in a proposal
};

export default function CatalogForUser({
    domainId,
    userId,
    hasFeedback = false,
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
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [feedbackMap, setFeedbackMap] = useState<Record<string, boolean | undefined>>({});

    useEffect(() => {
        if (!domainId) return;
        setLoading(true);
        setError(null);

        const options: { limit?: number; userId?: string } = { limit: 50 };
        if (userId) options.userId = userId;

        (async () => {
            try {
                const response = await apiClient.getArtworks(domainId, options);
                setArtworks(response.items ?? []);
                const map: Record<string, boolean | undefined> = {};
                (response.items ?? []).forEach((a) => {
                    // normalize different API shapes for like flag
                    if ((a as Artwork & { liked?: boolean }).liked === true) map[a.id] = true;
                    if ((a as Artwork & { liked?: boolean }).liked === false) map[a.id] = false;
                    if ((a as Artwork & { likedStatus?: string }).likedStatus === 'Liked') map[a.id] = true;
                    if ((a as Artwork & { likedStatus?: string }).likedStatus === 'Disliked') map[a.id] = false;
                });
                setFeedbackMap(map);
            } catch (err) {
                console.error('CatalogForUser: failed to load artworks', err);
                setArtworks([]);
                setError('Failed to load artworks');
            } finally {
                setLoading(false);
            }
        })();
    }, [domainId, userId]);

    const visible = artworks; // No filtering by feedback status

    if (loading) return <div>Loading catalog...</div>;
    if (error) return <div className="text-red-600">{error}</div>;
    if (visible.length === 0) return <div>No artworks</div>;

    // Decide whether to show thumbs and whether they are actionable
    const showReadOnly = showReadOnlyThumbs || ownersExperience;
    const showThumbs = showPreferenceButtons || showReadOnly;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {visible.map((artwork) => {
                const likedStatus = artwork.likedStatus ?? (feedbackMap[artwork.id] === true ? 'Liked' : feedbackMap[artwork.id] === false ? 'Disliked' : 'NotTasted');
                const inProposal = isInProposal?.(artwork.id) ?? false;

                return (
                    <article key={artwork.id} className="flex flex-col gap-3 group">
                        {/* Image Container */}
                        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-100 shadow-sm transition-all duration-300 group-hover:shadow-md">
                            <button
                                type="button"
                                className="absolute inset-0 z-0 w-full h-full cursor-pointer focus:outline-none"
                                onClick={() => onArtworkClick?.(artwork)}
                                aria-label={`View details for ${artwork.title}`}
                            >
                                {artwork.filename ? (
                                    <img
                                        src={artwork.filename}
                                        alt={artwork.title}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-gray-400">No Image</div>
                                )}
                            </button>

                            {/* Price Badge */}
                            {artwork.price !== undefined && (artwork.shouldDisplayPrice ?? true) && (
                                <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                                    ${artwork.price.toLocaleString()}
                                </div>
                            )}

                            {/* Proposal Badge */}
                            {inProposal && (
                                <div className="absolute top-3 left-3 z-10 bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
                                    In Proposal
                                </div>
                            )}
                        </div>

                        {/* Info & Actions Footer */}
                        <div className="flex items-start justify-between gap-4 px-1">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-gray-900 truncate leading-tight" title={artwork.title}>
                                    {artwork.title}
                                </h3>
                                <p className="text-sm text-gray-500 truncate mt-0.5" title={artwork.artist}>
                                    {artwork.artist}
                                </p>
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
                                                onClick={(e) => { e.stopPropagation(); !showReadOnly && onPreferenceClick?.(artwork.id, true, e); }}
                                                className={`p-2 rounded-full transition-colors ${artwork.likedStatus === 'Liked'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                                    }`}
                                                aria-label="Thumbs up"
                                                tabIndex={showReadOnly ? -1 : 0}
                                            >
                                                <ThumbsUp className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={showReadOnly}
                                                onClick={(e) => { e.stopPropagation(); !showReadOnly && onPreferenceClick?.(artwork.id, false, e); }}
                                                className={`p-2 rounded-full transition-colors ${artwork.likedStatus === 'Disliked'
                                                    ? 'bg-red-100 text-red-600'
                                                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                                aria-label="Thumbs down"
                                                tabIndex={showReadOnly ? -1 : 0}
                                            >
                                                <ThumbsDown className="w-5 h-5" />
                                            </button>
                                        </>
                                    ) : (
                                        // Read-only indicator
                                        <div className="flex gap-2 px-2 py-1">
                                            <ThumbsUp className={`w-5 h-5 ${likedStatus === 'Liked' ? 'text-green-500' : 'text-gray-300'}`} />
                                            <ThumbsDown className={`w-5 h-5 ${likedStatus === 'Disliked' ? 'text-red-500' : 'text-gray-300'}`} />
                                        </div>
                                    )
                                ) : null}

                                {onAddToDraft && (
                                    <button
                                        type="button"
                                        aria-label={isInProposal?.(artwork.id) ? 'Remove from Proposal' : 'Add to Proposal'}
                                        onClick={(e) => { e.stopPropagation(); onAddToDraft(artwork); }}
                                        className={`p-2 rounded-full transition-colors ${isInProposal?.(artwork.id)
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'text-gray-400 hover:bg-gray-100 hover:text-blue-600'
                                            }`}
                                    >
                                        <FileText className="w-5 h-5" />
                                    </button>
                                )}

                                {onEditClick && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onEditClick(artwork, e); }}
                                        aria-label="Edit"
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                )}
                                {onDeleteClick && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onDeleteClick(artwork, e); }}
                                        aria-label="Delete"
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

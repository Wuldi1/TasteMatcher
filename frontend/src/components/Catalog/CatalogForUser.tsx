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
                (response.items ?? []).forEach((artwork: any) => {
                    if (typeof artwork.liked === 'boolean') map[artwork.id] = artwork.liked;
                    if (typeof artwork.likedStatus === 'boolean') map[artwork.id] = artwork.likedStatus;
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((artwork) => {
                const likedStatus = (artwork as any).likedStatus ?? (feedbackMap[artwork.id] === true ? 'Liked' : feedbackMap[artwork.id] === false ? 'Disliked' : 'NotTasted');
                const inProposal = isInProposal?.(artwork.id) ?? false;

                return (
                    <div key={artwork.id} className="relative border rounded overflow-hidden bg-white shadow-sm flex flex-col">
                        {/* Proposal Badge */}
                        {inProposal && (
                            <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded">
                                In Proposal
                            </div>
                        )}

                        <button
                            type="button"
                            className="block w-full h-40 bg-gray-100 overflow-hidden"
                            onClick={() => onArtworkClick?.(artwork)}
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
                            {/* Actions at the bottom */}
                            <div className="mt-auto flex items-center justify-between pt-3 gap-2">
                                {/* Single pair of thumbs (either actionable for customers or read-only indicator for owners/dealers) */}
                                {showThumbs ? (
                                    showPreferenceButtons ? (
                                        // Actionable buttons for customers
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={showReadOnly}
                                                onClick={() => !showReadOnly && onPreferenceClick?.(artwork.id, true)}
                                                className={`p-2 rounded-full ${artwork.likedStatus === 'Liked'
                                                    ? 'hover:bg-green-300'
                                                    : (showReadOnly ? '' : 'hover:bg-green-200')
                                                    }`}
                                                aria-label="Thumbs up"
                                                tabIndex={showReadOnly ? -1 : 0}
                                            >
                                                <ThumbsUp
                                                    className={`w-5 h-5 ${showReadOnly ? '' : 'hover:text-green-500'} ${artwork.likedStatus === 'Liked' ? 'text-green-600' : 'text-gray-400'}`}
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={showReadOnly}
                                                onClick={() => !showReadOnly && onPreferenceClick?.(artwork.id, false)}
                                                className={`p-2 rounded-full ${artwork.likedStatus === 'Disliked'
                                                    ? 'hover:bg-red-300'
                                                    : (showReadOnly ? '' : 'hover:bg-red-200')}`}
                                                aria-label="Thumbs down"
                                                tabIndex={showReadOnly ? -1 : 0}
                                            >
                                                <ThumbsDown
                                                    className={`w-5 h-5 ${showReadOnly ? '' : 'hover:text-red-500'} ${artwork.likedStatus === 'Disliked' ? 'text-red-600' : 'text-gray-400'}`}
                                                />
                                            </button>
                                        </div>
                                    ) : (
                                        // Read-only indicator (for Sales/owners/dealers)
                                        <div className="flex items-center gap-2" aria-hidden="true" aria-label={`Preference: ${likedStatus}`}>
                                            <ThumbsUp className={`w-5 h-5 ${likedStatus === 'Liked' ? 'text-green-600' : 'text-gray-300'}`} />
                                            <ThumbsDown className={`w-5 h-5 ${likedStatus === 'Disliked' ? 'text-red-600' : 'text-gray-300'}`} />
                                        </div>
                                    )
                                ) : (
                                    // placeholder to keep layout stable when thumbs are hidden
                                    <div className="w-10" />
                                )}

                                <div className="flex items-center gap-2">
                                    {onAddToDraft && (
                                        <button
                                            type="button"
                                            aria-label={isInProposal?.(artwork.id) ? 'Remove from Proposal' : 'Add to Proposal'}
                                            onClick={() => onAddToDraft(artwork)}
                                            className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 ${isInProposal?.(artwork.id)
                                                ? 'bg-green-100 hover:bg-green-200 focus:ring-green-500'
                                                : 'bg-blue-100 hover:bg-blue-200 focus:ring-blue-500'
                                                }`}
                                        >
                                            <FileText
                                                className={`w-5 h-5 ${isInProposal?.(artwork.id) ? 'text-green-600' : 'text-blue-600'}`}
                                            />
                                        </button>
                                    )}

                                    {onEditClick && (
                                        <button type="button" onClick={(e) => onEditClick(artwork, e)} aria-label="Edit" className="p-1 text-gray-600">
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    )}
                                    {onDeleteClick && (
                                        <button type="button" onClick={(e) => onDeleteClick(artwork, e)} aria-label="Delete" className="p-1 text-gray-600">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

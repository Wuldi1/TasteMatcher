import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import type { Proposal, ProposalItem, Comment, Artwork } from '@tastematcher/common';
import { Trash2, Bell, Save, CheckCircle, Send, Clock, XCircle, MessageSquare } from 'lucide-react';

export default function SaleProposal({
    dealerEmail,
    domainId,
    userId,
    userName,
    draftItems = [],
    onDraftChange,
    proposalId,
    onProposalSave,
    onProposalDelete,
}: {
    dealerEmail?: string;
    domainId: string;
    userId: string;
    userName?: string;
    draftItems?: ProposalItem[];
    onDraftChange?: (items: ProposalItem[]) => void;
    proposalId?: string;
    onProposalSave?: (proposal: Proposal) => void;
    onProposalDelete?: () => void;
}) {
    // Use the passed draftItems as the source of truth; keep local copy for editing convenience
    const [items, setItems] = useState<ProposalItem[]>(draftItems ?? []);
    const isLocalChangeRef = React.useRef<boolean>(false);
    const [saving, setSaving] = useState(false);

    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [artworkDataById, setArtworkDataById] = useState<Record<string, Artwork>>({});

    // Modal states
    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

    const showAlert = (title: string, message: string) => setAlertState({ isOpen: true, title, message });
    const showConfirm = (title: string, message: string, onConfirm: () => void) => setConfirmState({ isOpen: true, title, message, onConfirm });

    // Track new comments for each artworkId
    const [newComments, setNewComments] = useState<Record<string, string>>({});

    // Sync incoming draft changes
    useEffect(() => {
        setItems(draftItems ?? []);
    }, [draftItems]);

    // Notify parent when items change (only when change originated locally)
    useEffect(() => {
        if (onDraftChange && isLocalChangeRef.current) {
            isLocalChangeRef.current = false;
            onDraftChange(items);
        }
    }, [items, onDraftChange]);

    // Load existing proposal if proposalId provided
    useEffect(() => {
        if (!proposalId) return;
        let mounted = true;
        (async () => {
            try {
                const fetched = await apiClient.getProposal(domainId, proposalId);
                if (!mounted) return;
                // normalize items if necessary (assume API returns items array of { artworkId, comments, status })
                const normalized: ProposalItem[] = (fetched.items ?? []).map((item: any) => ({
                    artworkId: item.artworkId,
                    comments: item.comments ?? [],
                    status: (item.status as ProposalItem['status']) ?? 'pending',
                    taggedAt: item.taggedAt ?? Date.now(),
                    title: item.title,
                    filename: item.filename,
                }));
                setItems(normalized);
            } catch (err) {
                console.error('Failed to load proposal', err);
            }
        })();
        return () => { mounted = false; };
    }, [proposalId, domainId]);

    // Load customer email for comment-author detection (so we can know if customer responded)
    useEffect(() => {
        if (!userId || !domainId) return;
        let mounted = true;
        (async () => {
            try{
                 await apiClient.getUser(userId, domainId);
                if (!mounted) return;
            } catch (err) {
                console.error('Failed to fetch customer email', err);
            }
        })();
        return () => { mounted = false; };
    }, [userId, domainId]);

    // Fetch artwork data for each artworkId in the proposal
    useEffect(() => {
        const fetchArtworkData = async () => {
            const artworkIds = draftItems.map((item) => item.artworkId);
            const fetchedData: Record<string, Artwork> = {};

            await Promise.all(
                artworkIds.map(async (artworkId) => {
                    try {
                        const artwork = await apiClient.getArtwork(domainId, artworkId);
                        fetchedData[artworkId] = artwork;
                    } catch (err) {
                        console.error(`Failed to fetch artwork data for ID: ${artworkId}`, err);
                    }
                })
            );

            setArtworkDataById(fetchedData);
        };

        if (draftItems.length > 0) {
            fetchArtworkData();
        }
    }, [draftItems, domainId]);

    async function saveProposal() {
        if (!userId) {
            showAlert('Missing User', 'Select a user first');
            return;
        }
        if (items.length === 0) {
            showAlert('Empty Proposal', 'Tag at least one artwork before submitting');
            return;
        }

        setSaving(true);
        try {
            const payload: Partial<Proposal> = {
                userId,
                items: items.map((item) => ({
                    artworkId: item.artworkId,
                    comments: item.comments,
                    status: item.status,
                })) as any,
            };

            let data;
            if (proposalId) {
                // update existing proposal
                data = await apiClient.updateProposal(domainId, proposalId, payload);
                showProposalSummaryAlert('Proposal updated', data);
            } else {
                // create new
                data = await apiClient.createProposal(domainId, payload);
                showProposalSummaryAlert('Proposal created', data);
            }
            
            // Notify parent of the saved proposal (so buttons enable immediately)
            if (onProposalSave) {
                onProposalSave(data);
            }
        } catch (err) {
            console.error('Failed to save proposal', err);
            showAlert('Error', 'Failed to save proposal');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteProposal() {
        if (!proposalId) {
            showAlert('Error', 'No saved proposal to delete');
            return;
        }
        
        showConfirm('Delete Proposal', 'Are you sure you want to delete this proposal?', async () => {
            try {
                await apiClient.deleteProposal(domainId, proposalId);
                showAlert('Success', 'Proposal deleted');
                // clear items and notify parent
                isLocalChangeRef.current = true;
                setItems([]);
                if (onDraftChange) onDraftChange([]);
                if (onProposalDelete) onProposalDelete();
            } catch (err) {
                console.error('Failed to delete proposal', err);
                showAlert('Error', 'Failed to delete proposal');
            }
        });
    }

    async function handlePingProposal() {
        if (!proposalId) {
            showAlert('Error', 'No saved proposal to ping');
            return;
        }
        try {
            await apiClient.pingProposal(domainId, proposalId);
            showAlert('Success', 'Customer pinged');
        } catch (err) {
            console.error('Failed to ping customer', err);
            showAlert('Error', 'Failed to ping customer');
        }
    }

    async function handleSubmitProposal() {
        if (!proposalId) {
            showAlert('Error', 'No saved proposal to submit');
            return;
        }

        try {
            const updated = await apiClient.updateProposal(domainId, proposalId, { status: 'submitted' });
            setIsSubmitModalOpen(false);
            showProposalSummaryAlert('Proposal submitted successfully!', updated);
            if (onProposalSave) onProposalSave(updated);
        } catch (err) {
            console.error('Failed to submit proposal', err);
            showAlert('Error', 'Failed to submit proposal');
        }
    }

    // Helper to show a summary alert for a proposal
    function showProposalSummaryAlert(title: string, proposal: Proposal) {
        const summary = [
            `Status: ${proposal.status}`,
            `Number of artworks: ${proposal.items?.length ?? 0}`,
        ].join('\n');
        showAlert(title, summary);
    }

    // Handler to add a comment to an item
    function handleAddComment(artworkId: string) {
        const commentText = (newComments[artworkId] || '').trim();
        if (!commentText) return;
        isLocalChangeRef.current = true;
        setItems((prev) =>
            prev.map((item) =>
                item.artworkId === artworkId
                    ? {
                        ...item,
                        comments: [
                            ...(item.comments || []),
                            {
                                author: dealerEmail ?? 'Dealer',
                                text: commentText,
                                createdAt: Date.now(),
                            },
                        ],
                    }
                    : item
            )
        );
        setNewComments((prev) => ({ ...prev, [artworkId]: '' }));
    }

    // Handler to delete an artwork from the proposal
    function handleDeleteArtwork(artworkId: string) {
        showConfirm('Remove Item', 'Remove this artwork from the proposal?', () => {
            isLocalChangeRef.current = true;
            setItems((prev) => prev.filter((item) => item.artworkId !== artworkId));
            // Note: We use the filtered result directly to ensure sync
            const newItems = items.filter((item) => item.artworkId !== artworkId);
            if (onDraftChange) onDraftChange(newItems);
        });
    }

    // Determine overall proposal status based on items' status
    const allApproved = items.every((item) => item.status === 'approved');
    const somePending = items.some((item) => item.status === 'pending');
    const status = allApproved ? 'approved' : somePending ? 'pending' : 'rejected';

    return (
        <div
            className="space-y-8 pb-24"
            // provide large bottom padding so sticky actions don't overlap page content on mobile
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 160px)' }}
        >
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Proposal Items</h2>
                    <p className="text-sm text-gray-500">{items.length} artworks selected</p>
                </div>
                <div className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-600 capitalize">
                    Status: {status}
                </div>
            </div>

            <div className="space-y-6">
                {items.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        No items tagged yet. Add artworks from the catalog.
                    </div>
                ) : (
                    items.map((item: ProposalItem) => {
                        const artwork = artworkDataById[item.artworkId];

                        const statusConfig = {
                            pending: {
                                color: 'bg-gray-100 text-gray-600',
                                text: 'Pending',
                                icon: <Clock className="w-4 h-4" />,
                                borderColor: 'border-gray-200'
                            },
                            approved: {
                                color: 'bg-green-50 text-green-700',
                                text: 'Accepted',
                                icon: <CheckCircle className="w-4 h-4" />,
                                borderColor: 'border-green-200'
                            },
                            rejected: {
                                color: 'bg-red-50 text-red-700',
                                text: 'Rejected',
                                icon: <XCircle className="w-4 h-4" />,
                                borderColor: 'border-red-200'
                            },
                        };

                        const { color, text, icon, borderColor } = statusConfig[item.status];

                        return (
                            <article key={item.artworkId} className={`bg-white border ${borderColor} rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md flex flex-col lg:flex-row`}>
                                {/* Image Section */}
                                <div className="lg:w-1/4 bg-gray-50 relative">
                                    {artwork?.filename ? (
                                        <div className="aspect-[4/3] lg:aspect-auto lg:h-full w-full">
                                            <img src={artwork.filename} alt={item.artworkId} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-64 lg:h-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">No image</div>
                                    )}
                                </div>

                                {/* Content Section */}
                                <div className="flex-1 p-6 flex flex-col">
                                    <div className="flex justify-between items-start gap-4 mb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{artwork?.title ?? 'Untitled'}</h3>
                                            <p className="text-gray-600 text-sm">{artwork?.artist ?? 'Unknown Artist'}</p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full ${color}`}>
                                            {icon}
                                            {text}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm text-gray-600 mb-6">
                                        <div><span className="text-gray-400 text-xs uppercase mr-2">Medium:</span> {artwork?.medium ?? '—'}</div>
                                        <div><span className="text-gray-400 text-xs uppercase mr-2">Size:</span> {artwork?.width && artwork?.height ? `${artwork.width} × ${artwork.height} cm` : '—'}</div>
                                        <div><span className="text-gray-400 text-xs uppercase mr-2">Price:</span> {artwork?.price !== undefined ? `$${artwork.price.toLocaleString()}` : '—'}</div>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-gray-100 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteArtwork(item.artworkId)}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Remove artwork from proposal"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Remove Item
                                        </button>
                                    </div>
                                </div>

                                {/* Comments Section */}
                                <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-4 flex flex-col">
                                    <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        <MessageSquare className="w-3 h-3" />
                                        Comments
                                    </div>
                                    
                                    <div className="flex-1 space-y-3 overflow-y-auto max-h-48 lg:max-h-none mb-3 pr-1 custom-scrollbar">
                                        {item.comments.length === 0 ? (
                                            <div className="text-xs text-gray-400 italic text-center py-2">No comments</div>
                                        ) : (
                                            item.comments.map((comment: Comment, index: number) => (
                                                <div key={index} className={`p-2.5 rounded-lg text-sm ${comment.author === (dealerEmail ?? 'Dealer') ? 'bg-white border border-gray-200 mr-2' : 'bg-blue-50 border border-blue-100 ml-2'}`}>
                                                    <div className="flex justify-between items-baseline mb-1">
                                                        <span className="font-semibold text-xs text-gray-700">{comment.author}</span>
                                                        <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-gray-700 text-xs">{comment.text}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <form
                                        className="mt-auto relative"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleAddComment(item.artworkId);
                                        }}
                                    >
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-md pl-2 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            placeholder="Add note..."
                                            value={newComments[item.artworkId] || ''}
                                            onChange={(e) =>
                                                setNewComments((prev) => ({
                                                    ...prev,
                                                    [item.artworkId]: e.target.value,
                                                }))
                                            }
                                        />
                                        <button
                                            type="submit"
                                            className="absolute right-1 top-1 p-1 text-blue-600 hover:bg-blue-50 rounded"
                                            disabled={!newComments[item.artworkId]?.trim()}
                                        >
                                            <Send className="w-3 h-3" />
                                        </button>
                                    </form>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>

            {/* Sticky Bottom Actions — positioned above mobile bottom bars using safe-area inset */}
            <div
                className="fixed left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 88px)' }}
            >
                <div className="max-w-7xl mx-auto flex justify-end gap-3">
                    <button
                        onClick={handlePingProposal}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-yellow-200 text-yellow-700 rounded-xl font-medium hover:bg-yellow-50 transition-colors disabled:opacity-50"
                        disabled={!proposalId}
                    >
                        <Bell className="w-4 h-4" />
                        Ping
                    </button>
                    <button
                        onClick={saveProposal}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-xl font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
                        disabled={saving || items.length === 0}
                    >
                        <Save className="w-4 h-4" />
                        Save
                    </button>
                    <button
                        onClick={handleDeleteProposal}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-700 rounded-xl font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                        disabled={!proposalId}
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                    <button
                        onClick={() => setIsSubmitModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50"
                        disabled={!proposalId}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Submit
                    </button>
                </div>
            </div>

            {/* Submit Modal */}
            {isSubmitModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-96">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Submit Proposal</h2>
                        <p className="text-sm text-gray-600">
                            Once submitted, your customer will be notified of the active proposal. The proposal will be shared with them for their feedback.
                        </p>
                        <div className="mt-6 flex justify-end gap-4">
                            <button
                                onClick={() => setIsSubmitModalOpen(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitProposal}
                                className="px-4 py-2 bg-green-600 text-white rounded"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Alert Modal */}
            {alertState && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-96">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">{alertState.title}</h2>
                        <p className="text-sm text-gray-600 whitespace-pre-line">{alertState.message}</p>
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setAlertState(null)}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmState && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-96">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">{confirmState.title}</h2>
                        <p className="text-sm text-gray-600">{confirmState.message}</p>
                        <div className="mt-6 flex justify-end gap-4">
                            <button
                                onClick={() => setConfirmState(null)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    confirmState.onConfirm();
                                    setConfirmState(null);
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import type { Proposal, ProposalItem, Comment, Artwork } from '@tastematcher/common';
import { Trash2, Bell, Save, CheckCircle, XCircle, Clock, Send } from 'lucide-react';

export default function SaleProposal({
    domainId,
    userId,
    userName,
    draftItems = [],
    onDraftChange,
    proposalId,
}: {
    domainId: string;
    userId: string;
    userName?: string;
    draftItems?: ProposalItem[];
    onDraftChange?: (items: ProposalItem[]) => void;
    proposalId?: string;
}) {
    // Use the passed draftItems as the source of truth; keep local copy for editing convenience
    const [items, setItems] = useState<ProposalItem[]>(draftItems ?? []);
    const isLocalChangeRef = React.useRef<boolean>(false);
    const [saving, setSaving] = useState(false);

    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [artworkDataById, setArtworkDataById] = useState<Record<string, Artwork>>({});

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
            alert('Select a user first');
            return;
        }
        if (items.length === 0) {
            alert('Tag at least one artwork before submitting');
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
            // if created, you may want to set up the proposalId for further edits (left to consumer)
        } catch (err) {
            console.error('Failed to save proposal', err);
            alert('Failed to save proposal');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteProposal() {
        if (!proposalId) {
            alert('No saved proposal to delete');
            return;
        }
        if (!window.confirm('Delete this proposal?')) return;
        try {
            await apiClient.deleteProposal(domainId, proposalId);
            alert('Proposal deleted');
            // clear items and notify parent
            isLocalChangeRef.current = true;
            setItems([]);
            if (onDraftChange) onDraftChange([]);
        } catch (err) {
            console.error('Failed to delete proposal', err);
            alert('Failed to delete proposal');
        }
    }

    async function handlePingProposal() {
        if (!proposalId) {
            alert('No saved proposal to ping');
            return;
        }
        try {
            await apiClient.pingProposal(domainId, proposalId);
            alert('Customer pinged');
        } catch (err) {
            console.error('Failed to ping customer', err);
            alert('Failed to ping customer');
        }
    }

    async function handleSubmitProposal() {
        if (!proposalId) {
            alert('No saved proposal to submit');
            return;
        }

        try {
            const updated = await apiClient.updateProposal(domainId, proposalId, { status: 'submitted' });
            showProposalSummaryAlert('Proposal submitted successfully!', updated);
            setIsSubmitModalOpen(false);
        } catch (err) {
            console.error('Failed to submit proposal', err);
            alert('Failed to submit proposal');
        }
    }

    // Helper to show a summary alert for a proposal
    function showProposalSummaryAlert(title: string, proposal: Proposal) {
        const summary = [
            `Status: ${proposal.status}`,
            `Number of artworks: ${proposal.items?.length ?? 0}`,
        ].join('\n');
        alert(`${title}\n\n${summary}`);
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
                                author: userName ?? 'Dealer',
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
        if (!window.confirm('Remove this artwork from the proposal?')) return;
        isLocalChangeRef.current = true;
        setItems((prev) => prev.filter((item) => item.artworkId !== artworkId));
        if (onDraftChange) onDraftChange(items.filter((item) => item.artworkId !== artworkId));
    }

    // Determine overall proposal status based on items' status
    const allApproved = items.every((item) => item.status === 'approved');
    const somePending = items.some((item) => item.status === 'pending');
    const status = allApproved ? 'approved' : somePending ? 'pending' : 'rejected';

    return (
        <div className="space-y-6">
            <div>
                <strong>Proposal status:</strong> {status}
            </div>

            <div className="space-y-4">
                {items.length === 0 ? (
                    <div>No items tagged yet.</div>
                ) : (
                    items.map((item: ProposalItem) => {
                        const statusIcon = {
                            pending: <Clock className="text-gray-500" />,
                            approved: <CheckCircle className="text-green-600" />,
                            rejected: <XCircle className="text-red-600" />,
                        };
                        const artwork = artworkDataById[item.artworkId];

                        return (
                            <article key={item.artworkId} className="bg-white border rounded p-4 shadow-sm">
                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="md:w-1/4">
                                        {artwork?.filename ? (
                                            <a href={artwork.filename} target="_blank" rel="noopener noreferrer">
                                                <img src={artwork.filename} alt={item.artworkId} className="w-full h-40 object-cover rounded" />
                                            </a>
                                        ) : (
                                            <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-sm rounded">No image</div>
                                        )}
                                    </div>

                                    <div className="md:w-1/3">
                                        <h3 className="text-base font-semibold">{artwork?.title ?? item.artworkId}</h3>
                                        <div className="mt-4 flex items-center gap-2">
                                            <span className="flex items-center gap-1">
                                                {statusIcon[item.status]}
                                                <span className="text-sm capitalize">{item.status}</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="md:flex-1 flex flex-col">
                                        <div className="text-sm font-medium mb-2">Comments</div>
                                        <div className="space-y-2 max-h-44 overflow-auto">
                                            {item.comments.length === 0 ? (
                                                <div className="text-sm text-gray-500">No comments</div>
                                            ) : (
                                                item.comments.map((comment: Comment, index: number) => (
                                                    <div key={index} className="p-2 bg-gray-50 rounded">
                                                        <div className="text-xs text-gray-500">
                                                            {comment.author} • {new Date(comment.createdAt).toLocaleString()}
                                                        </div>
                                                        <div className="mt-1 text-sm">{comment.text}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        {/* Add new comment input */}
                                        <form
                                            className="flex items-center gap-2 mt-2"
                                            onSubmit={e => {
                                                e.preventDefault();
                                                handleAddComment(item.artworkId);
                                            }}
                                        >
                                            <input
                                                type="text"
                                                className="flex-1 border rounded px-2 py-1 text-sm"
                                                placeholder="Add a comment..."
                                                value={newComments[item.artworkId] || ''}
                                                onChange={e =>
                                                    setNewComments((prev) => ({
                                                        ...prev,
                                                        [item.artworkId]: e.target.value,
                                                    }))
                                                }
                                            />
                                            <button
                                                type="submit"
                                                className="p-2 bg-blue-100 rounded-full"
                                                title="Add comment"
                                                disabled={!newComments[item.artworkId]?.trim()}
                                            >
                                                <Send className="w-4 h-4 text-blue-600" />
                                            </button>
                                        </form>
                                    </div>

                                    {/* Delete artwork button */}
                                    <div className="flex flex-col items-end md:items-start md:justify-start">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteArtwork(item.artworkId)}
                                            className="p-2 bg-red-100 rounded-full"
                                            title="Remove artwork from proposal"
                                        >
                                            <Trash2 className="text-red-600" />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>

            <div className="flex justify-end gap-4">
                <div className="relative group">
                    <button onClick={handlePingProposal} disabled={!proposalId} className="p-2 bg-yellow-100 rounded-full">
                        <Bell className="text-yellow-600" />
                    </button>
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 rounded-md bg-gray-800 text-white px-2 py-1 text-xs opacity-0 group-hover:opacity-100">
                        Ping customer
                    </div>
                </div>
                <div className="relative group">
                    <button onClick={saveProposal} disabled={saving || items.length === 0} className="p-2 bg-blue-100 rounded-full">
                        <Save className="text-blue-600" />
                    </button>
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 rounded-md bg-gray-800 text-white px-2 py-1 text-xs opacity-0 group-hover:opacity-100">
                        Save proposal
                    </div>
                </div>
                <div className="relative group">
                    <button onClick={handleDeleteProposal} disabled={!proposalId} className="p-2 bg-red-100 rounded-full">
                        <Trash2 className="text-red-600" />
                    </button>
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 rounded-md bg-gray-800 text-white px-2 py-1 text-xs opacity-0 group-hover:opacity-100">
                        Delete proposal
                    </div>
                </div>
                <div className="relative group">
                    <button onClick={() => setIsSubmitModalOpen(true)} disabled={!proposalId} className="p-2 bg-green-100 rounded-full">
                        <CheckCircle className="text-green-600" />
                    </button>
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 rounded-md bg-gray-800 text-white px-2 py-1 text-xs opacity-0 group-hover:opacity-100">
                        Submit proposal
                    </div>
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
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import type { Proposal, ProposalItem, Comment, Artwork } from '@tastematcher/common';
import { CheckCircle, XCircle, Clock, Send, Save } from 'lucide-react';

export default function ProposalView({
  proposal,
  onStatusChange,
}: {
  proposal: Proposal;
  onStatusChange?: (status: 'accepted' | 'rejected' | 'submitted') => void;
}) {
  const { items = [], userId, domainId, id } = proposal;

  const [localItems, setLocalItems] = useState<ProposalItem[]>(items);
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const [artworkDataById, setArtworkDataById] = useState<Record<string, Artwork>>({});
  const [saving, setSaving] = useState(false);

  // Sync incoming draft changes
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Load artwork data for each artworkId in the proposal
  useEffect(() => {
    const fetchArtworkData = async () => {
      const artworkIds = items.map((item) => item.artworkId);
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

    if (items.length > 0) {
      fetchArtworkData();
    }
  }, [items, domainId]);

  // Handler to update the status of an individual artwork
  const handleArtworkStatusChange = (artworkId: string, status: 'approved' | 'rejected') => {
    setLocalItems((prev) =>
      prev.map((item) =>
        item.artworkId === artworkId ? { ...item, status } : item
      )
    );
  };

  // Handler to add a comment to an item
  const handleAddComment = (artworkId: string) => {
    const commentText = (newComments[artworkId] || '').trim();
    if (!commentText) return;

    setLocalItems((prev) =>
      prev.map((item) =>
        item.artworkId === artworkId
          ? {
              ...item,
              comments: [
                ...(item.comments || []),
                {
                  author: 'Customer',
                  text: commentText,
                  createdAt: Date.now(),
                },
              ],
            }
          : item
      )
    );
    setNewComments((prev) => ({ ...prev, [artworkId]: '' }));
  };

  // Save proposal changes
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Proposal> = {
        userId,
        items: localItems.map((item) => ({
          artworkId: item.artworkId,
          comments: item.comments,
          status: item.status,
        })),
      };

      await apiClient.updateProposal(domainId, id, payload);
      alert('Proposal saved successfully!');
      onStatusChange?.('submitted');
    } catch (err) {
      console.error('Failed to save proposal', err);
      alert('Failed to save proposal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <strong>Proposal status:</strong> {proposal.status}
      </div>

      <div className="space-y-4">
        {localItems.length === 0 ? (
          <div>No items tagged yet.</div>
        ) : (
          localItems.map((item: ProposalItem) => {
            const artwork = artworkDataById[item.artworkId];

            // Determine the status badge color, text, and icon
            const statusConfig = {
              pending: {
                color: 'bg-gray-200 text-gray-600',
                text: 'Pending',
                icon: <Clock className="w-4 h-4 text-gray-600" />,
              },
              approved: {
                color: 'bg-green-100 text-green-600',
                text: 'Accepted',
                icon: <CheckCircle className="w-4 h-4 text-green-600" />,
              },
              rejected: {
                color: 'bg-red-100 text-red-600',
                text: 'Rejected',
                icon: <XCircle className="w-4 h-4 text-red-600" />,
              },
            };

            const { color, text, icon } = statusConfig[item.status];

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
                    {artwork?.price !== undefined && (
                      <div className="text-xs text-green-700 font-semibold mt-1">${artwork.price.toLocaleString()}</div>
                    )}
                    {/* Status Badge with Icon */}
                    <span
                      className={`inline-flex items-center gap-2 mt-2 px-3 py-1 text-sm font-medium rounded-full ${color}`}
                    >
                      {icon}
                      {text}
                    </span>
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
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddComment(item.artworkId);
                      }}
                    >
                      <input
                        type="text"
                        className="flex-1 border rounded px-2 py-1 text-sm"
                        placeholder="Add a comment..."
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
                        className="p-2 bg-blue-100 rounded-full hover:bg-blue-200"
                        title="Add comment"
                        disabled={!newComments[item.artworkId]?.trim()}
                      >
                        <Send className="w-4 h-4 text-blue-600" />
                      </button>
                    </form>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="flex justify-end gap-4 mt-4">
                  <button
                    onClick={() => handleArtworkStatusChange(item.artworkId, 'approved')}
                    className={`flex items-center gap-2 px-4 py-2 rounded ${
                      item.status === 'approved'
                        ? 'bg-green-200 text-green-700'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                    title="Accept"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleArtworkStatusChange(item.artworkId, 'rejected')}
                    className={`flex items-center gap-2 px-4 py-2 rounded ${
                      item.status === 'rejected'
                        ? 'bg-red-200 text-red-700'
                        : 'bg-red-100 text-red-600 hover:bg-red-200'
                    }`}
                    title="Reject"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 py-4 flex justify-end gap-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          Save
        </button>
        <button
          onClick={() => onStatusChange?.('rejected')}
          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
        >
          <XCircle className="w-4 h-4" />
          Reject Proposal
        </button>
        <button
          onClick={() => onStatusChange?.('accepted')}
          className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded hover:bg-green-200"
        >
          <CheckCircle className="w-4 h-4" />
          Accept Proposal
        </button>
      </div>
    </div>
  );
}
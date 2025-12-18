import { useEffect, useState, useMemo } from 'react';
import { apiClient } from '../../utils/api';
import type { Proposal, ProposalItem, Comment, Artwork } from '@tastematcher/common';
import { CheckCircle, XCircle, Clock, Send, Save, MessageSquare, Calendar, Image as ImageIcon } from 'lucide-react';

export default function ProposalView({
  proposal,
  onStatusChange,
}: {
  proposal: Proposal;
  onStatusChange?: (status: 'accepted' | 'rejected' | 'submitted') => void;
}) {
  const { items = [], userId, domainId, id, generalComments: initialGeneralComments = [] } = proposal;

  const [localItems, setLocalItems] = useState<ProposalItem[]>(items);
  const [generalComments, setGeneralComments] = useState<Comment[]>(initialGeneralComments);
  const [newGeneralComment, setNewGeneralComment] = useState('');
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const [artworkDataById, setArtworkDataById] = useState<Record<string, Artwork>>({});
  const [saving, setSaving] = useState(false);

  // Modal state
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);
  const showAlert = (title: string, message: string) => setAlertState({ isOpen: true, title, message });

  const isReadOnly = proposal.status === 'accepted' || proposal.status === 'rejected';

  // Sync incoming draft changes
  useEffect(() => {
    setLocalItems(items);
    setGeneralComments(initialGeneralComments);
  }, [items, initialGeneralComments]);

  // Check for changes
  const isDirty = useMemo(() => {
    if (newGeneralComment.trim().length > 0) return true;
    return JSON.stringify(localItems) !== JSON.stringify(items);
  }, [localItems, items, newGeneralComment]);

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
    if (isReadOnly) return;
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

  // Save proposal changes (Update)
  const handleUpdate = async () => {
    setSaving(true);
    try {
      const updatedGeneralComments = [...generalComments];
      if (newGeneralComment.trim()) {
        updatedGeneralComments.push({
            author: 'Customer',
            text: newGeneralComment.trim(),
            createdAt: Date.now()
        });
      }

      const payload: Partial<Proposal> = {
        userId,
        items: localItems.map((item) => ({
          artworkId: item.artworkId,
          comments: item.comments,
          status: item.status,
          askedPrice: item.askedPrice,
        })),
        generalComments: updatedGeneralComments,
      };

      const updated = await apiClient.updateProposal(domainId, id, payload);
      
      // Update local state
      setGeneralComments(updated.generalComments || []);
      setNewGeneralComment('');
      
      showAlert('Success', 'Proposal updated successfully!');
    } catch (err) {
      console.error('Failed to save proposal', err);
      showAlert('Error', 'Failed to save proposal');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (status: 'accepted' | 'rejected') => {
      setSaving(true);
      try {
          await apiClient.updateProposal(domainId, id, { status });
          showAlert('Success', `Proposal ${status}!`);
          onStatusChange?.(status);
      } catch (err) {
          console.error(`Failed to ${status} proposal`, err);
          showAlert('Error', `Failed to ${status} proposal`);
      } finally {
          setSaving(false);
      }
  };

  // Calculate summary stats
  const approvedCount = localItems.filter((item) => item.status === 'approved').length;
  const rejectedCount = localItems.filter((item) => item.status === 'rejected').length;
  const pendingCount = Math.max(localItems.length - approvedCount - rejectedCount, 0);
  const lastUpdatedDate = proposal.updatedAt ? new Date(proposal.updatedAt).toLocaleDateString() : new Date(proposal.createdAt).toLocaleDateString();

  return (
    <div
      className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6"
      // ensure page content has enough bottom padding to never be hidden by mobile navs
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 160px)' }}
    >
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proposal Offer</h1>
            <p className="text-gray-500 mt-1">Review the curated selection below</p>
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 capitalize ${
              proposal.status === 'accepted' ? 'bg-green-100 text-green-700' :
              proposal.status === 'rejected' ? 'bg-red-100 text-red-700' :
              'bg-blue-50 text-blue-700'
          }`}>
              {proposal.status === 'accepted' && <CheckCircle className="w-4 h-4" />}
              {proposal.status === 'rejected' && <XCircle className="w-4 h-4" />}
              {proposal.status === 'submitted' && <Clock className="w-4 h-4" />}
              {proposal.status}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="p-2 bg-gray-50 rounded-lg">
              <ImageIcon className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium">Artworks selected</p>
              <p className="font-semibold text-gray-900">{localItems.length} pieces</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="p-2 bg-gray-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium">Decision progress</p>
              <p className="font-semibold text-gray-900">
                {approvedCount} approved
                <span className="text-sm text-gray-500 ml-2">• {pendingCount} pending</span>
              </p>
              {rejectedCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">{rejectedCount} passed for now</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="p-2 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium">Last updated</p>
              <p className="font-semibold text-gray-900">{lastUpdatedDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* General Comments Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-bold text-gray-900">General Discussion</h3>
        </div>
        
        {generalComments.length > 0 && (
            <div className="space-y-3 mb-6">
                {generalComments.map((comment, index) => (
                    <div key={index} className={`p-3 rounded-lg border ${comment.author === 'Customer' ? 'bg-blue-50 border-blue-100 ml-8' : 'bg-gray-50 border-gray-100 mr-8'}`}>
                        <div className="flex justify-between items-baseline mb-1">
                            <span className="font-semibold text-sm text-gray-700">{comment.author}</span>
                            <span className="text-xs text-gray-500">{new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.text}</p>
                    </div>
                ))}
            </div>
        )}

        {!isReadOnly && (
            <div className="relative">
                <textarea
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    rows={3}
                    placeholder="Add a general comment or question about this proposal..."
                    value={newGeneralComment}
                    onChange={(e) => setNewGeneralComment(e.target.value)}
                />
            </div>
        )}
      </div>

      <div className="space-y-6">
        {localItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            No items in this proposal.
          </div>
        ) : (
          localItems.map((item: ProposalItem) => {
            const artwork = artworkDataById[item.artworkId];

            const statusConfig = {
              pending: {
                color: 'bg-gray-100 text-gray-600',
                text: 'Pending Review',
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
            const askedPriceDisplay =
              item.askedPrice === undefined
                ? '—'
                : item.askedPrice > 0
                  ? `$${item.askedPrice.toLocaleString()}`
                  : 'N/A';

            return (
              <article key={item.artworkId} className={`bg-white border ${borderColor} rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md flex flex-col lg:flex-row`}>
                {/* Image Section */}
                <div className="lg:w-1/3 xl:w-1/4 bg-gray-50 relative group">
                  {artwork?.filename ? (
                    <div className="aspect-[4/3] lg:aspect-auto lg:h-full w-full relative">
                        <img 
                            src={artwork.filename} 
                            alt={artwork.title || item.artworkId} 
                            className="w-full h-full object-cover" 
                        />
                        <a 
                            href={artwork.filename} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                            <span className="bg-white/90 text-gray-900 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">View Full Size</span>
                        </a>
                    </div>
                  ) : (
                    <div className="w-full h-64 lg:h-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">No image</div>
                  )}
                </div>

                {/* Content Section */}
                <div className="flex-1 p-6 flex flex-col">
                    <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">{artwork?.title ?? 'Untitled'}</h3>
                            <p className="text-gray-600 font-medium">{artwork?.artist ?? 'Unknown Artist'}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full ${color}`}>
                            {icon}
                            {text}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-6">
                        <div>
                            <span className="block text-xs text-gray-400 uppercase tracking-wider">Medium</span>
                            {artwork?.medium ?? '—'}
                        </div>
                        <div>
                            <span className="block text-xs text-gray-400 uppercase tracking-wider">Dimensions</span>
                            {artwork?.width && artwork?.height ? `${artwork.width} × ${artwork.height} cm` : '—'}
                        </div>
                        <div>
                            <span className="block text-xs text-gray-400 uppercase tracking-wider">Signature</span>
                            {artwork?.signature ?? '—'}
                        </div>
                        <div>
                            <span className="block text-xs text-gray-400 uppercase tracking-wider">Price</span>
                            {askedPriceDisplay}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-auto pt-6 border-t border-gray-100 flex gap-3">
                        <button
                            onClick={() => handleArtworkStatusChange(item.artworkId, 'approved')}
                            disabled={isReadOnly}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                                item.status === 'approved'
                                    ? 'bg-green-600 text-white shadow-sm'
                                    : isReadOnly 
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                            }`}
                        >
                            <CheckCircle className="w-4 h-4" />
                            Accept
                        </button>
                        <button
                            onClick={() => handleArtworkStatusChange(item.artworkId, 'rejected')}
                            disabled={isReadOnly}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                                item.status === 'rejected'
                                    ? 'bg-red-600 text-white shadow-sm'
                                    : isReadOnly
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                            }`}
                        >
                            <XCircle className="w-4 h-4" />
                            Reject
                        </button>
                    </div>
                </div>

                {/* Comments Section */}
                <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-900">
                        <MessageSquare className="w-4 h-4 text-gray-500" />
                        Discussion
                    </div>
                    
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-60 lg:max-h-none mb-3 pr-1 custom-scrollbar">
                        {item.comments.length === 0 ? (
                            <div className="text-sm text-gray-400 italic text-center py-4">No comments yet</div>
                        ) : (
                            item.comments.map((comment: Comment, index: number) => (
                                <div key={index} className={`p-3 rounded-lg text-sm ${comment.author === 'Customer' ? 'bg-blue-50 border border-blue-100 ml-4' : 'bg-white border border-gray-200 mr-4'}`}>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-semibold text-xs text-gray-700">{comment.author}</span>
                                        <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-gray-700">{comment.text}</p>
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
                            className="w-full border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                            placeholder="Write a comment..."
                            value={newComments[item.artworkId] || ''}
                            onChange={(e) =>
                                setNewComments((prev) => ({
                                    ...prev,
                                    [item.artworkId]: e.target.value,
                                }))
                            }
                            disabled={isReadOnly}
                        />
                        <button
                            type="submit"
                            className="absolute right-1.5 top-1.5 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={!newComments[item.artworkId]?.trim() || isReadOnly}
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

      {/* Sticky Bottom Actions */}
      <div
        className="fixed left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] md:bottom-0"
      >
        <div className="max-w-6xl mx-auto flex justify-end gap-3">
            {!isReadOnly && (
                <button
                    onClick={handleUpdate}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={saving || !isDirty}
                >
                    <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                    Update Proposal
                </button>
            )}
            
            {proposal.status !== 'rejected' && (
                <button
                    onClick={() => handleStatusUpdate('rejected')}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isReadOnly || saving}
                >
                    <XCircle className="w-4 h-4" />
                    Reject Proposal
                </button>
            )}

            {proposal.status !== 'accepted' && (
                <button
                    onClick={() => handleStatusUpdate('accepted')}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isReadOnly || saving}
                >
                    <CheckCircle className="w-4 h-4" />
                    Accept Proposal
                </button>
            )}
        </div>
      </div>

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
    </div>
  );
}

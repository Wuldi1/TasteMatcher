import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api';

interface EditArtworkModalProps {
  artwork: Artwork;
  onClose: () => void;
  onSave: (updatedArtwork: Artwork) => void;
}

export function EditArtworkModal({ artwork, onClose, onSave }: EditArtworkModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(artwork.title || '');
  const [artist, setArtist] = useState(artwork.artist || '');
  const [description, setDescription] = useState(artwork.description || '');
  const [signature, setSignature] = useState<string>(artwork.signature ?? '');
  const [medium, setMedium] = useState<string>(artwork.medium ?? '');
  const [widthInput, setWidthInput] = useState<string>(artwork.width !== undefined ? String(artwork.width) : '');
  const [heightInput, setHeightInput] = useState<string>(artwork.height !== undefined ? String(artwork.height) : '');
  const [priceInput, setPriceInput] = useState<string>(artwork.price !== undefined ? String(artwork.price) : '');
  const [shouldDisplayPrice, setShouldDisplayPrice] = useState<boolean>(artwork.shouldDisplayPrice ?? false);
  const [date, setDate] = useState(artwork.date || '');
  const [tags, setTags] = useState(artwork.tags?.join(', ') || '');
  const [error, setError] = useState('');

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Artwork>) => {
      if (!user?.domainId) throw new Error('No domain ID');
      return apiClient.updateArtwork(user.domainId, artwork.id, updates);
    },
    onSuccess: (updatedArtwork) => {
      onSave(updatedArtwork);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update artwork');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const parseNumberOrUndefined = (s: string) => {
      const trimmed = s.trim();
      if (trimmed === '') return undefined;
      const n = Number(trimmed);
      return Number.isNaN(n) ? undefined : n;
    };

    const updates: Partial<Artwork> = {
      title: title.trim() || undefined,
      artist: artist.trim() || undefined,
      description: description.trim() || undefined,
      signature: signature.trim() || undefined,
      medium: medium.trim() || undefined,
      width: parseNumberOrUndefined(widthInput),
      height: parseNumberOrUndefined(heightInput),
      price: parseNumberOrUndefined(priceInput),
      shouldDisplayPrice,
      // keep other fields below
      date: date.trim() || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };

    updateMutation.mutate(updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" role="dialog" aria-modal="true">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg md:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">Edit Artwork</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <form id="edit-form" onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-6 md:gap-8">
                
                {/* Left Column: Image */}
                <div className="w-full md:w-1/3 flex-shrink-0">
                    <div className="aspect-[3/4] w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200 sticky top-0">
                        {artwork.filename ? (
                            <img 
                                src={artwork.thumbnails?.[2]?.url || artwork.filename} 
                                alt={artwork.title} 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">No Image</div>
                        )}
                    </div>
                </div>

                {/* Right Column: Form Fields */}
                <div className="flex-1 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                            {error}
                        </div>
                    )}

                    {/* Title & Artist */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full text-lg font-bold text-gray-900 border-b-2 border-gray-200 focus:border-blue-500 outline-none px-0 py-1 transition-colors placeholder-gray-300"
                                placeholder="Untitled"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Artist</label>
                            <input
                                type="text"
                                value={artist}
                                onChange={(e) => setArtist(e.target.value)}
                                className="w-full text-base font-medium text-gray-700 border-b border-gray-200 focus:border-blue-500 outline-none px-0 py-1 transition-colors placeholder-gray-300"
                                placeholder="Unknown Artist"
                            />
                        </div>
                    </div>

                    {/* Price Section */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Price (USD)</label>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="w-full pl-7 pr-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={shouldDisplayPrice}
                                    onChange={(e) => setShouldDisplayPrice(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Publicly Visible
                            </label>
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Medium</label>
                            <input
                                type="text"
                                value={medium}
                                onChange={(e) => setMedium(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. Oil on canvas"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date</label>
                            <input
                                type="text"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. 2023"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Signature</label>
                            <input
                                type="text"
                                value={signature}
                                onChange={(e) => setSignature(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. Signed lower right"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dimensions (in)</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={widthInput}
                                    onChange={(e) => setWidthInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="W"
                                />
                                <span className="text-gray-400">×</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={heightInput}
                                    onChange={(e) => setHeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="H"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                            placeholder="Artwork description..."
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tags</label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Comma separated tags..."
                        />
                    </div>
                </div>
            </form>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 sticky bottom-0 z-10">
            <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
                Cancel
            </button>
            <button
                type="submit"
                form="edit-form"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
      </div>
    </div>
  );
}

import { useState, FormEvent, useRef, useEffect, ChangeEvent, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save, Sparkles, Upload as UploadIcon, RotateCcw, RotateCw, Loader2, Lock } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api';
import Cropper, { Area } from 'react-easy-crop';

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
  const [useForTaster, setUseForTaster] = useState<boolean>(artwork.useForTaster ?? false);
  const [isPrivate, setIsPrivate] = useState<boolean>(artwork.isPrivate ?? false);
  const [date, setDate] = useState(artwork.date || '');
  const [tags, setTags] = useState(artwork.tags?.join(', ') || '');
  const [error, setError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('artwork-edit.jpg');
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const canEditPrivacy = Boolean(user?.id && artwork.uploadedBy === user.id);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleRotationChange = (delta: number) => {
    setRotation((prev) => {
      const next = prev + delta;
      return ((next % 360) + 360) % 360;
    });
  };

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

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

  const handleSubmit = async (e: FormEvent) => {
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
      isPrivate: isPrivate,
      shouldDisplayPrice,
      useForTaster,
      // keep other fields below
      date: date.trim() || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };

    if (canEditPrivacy) {
      updates.isPrivate = isPrivate;
    }

    if (!user?.domainId) {
      setError('No domain ID');
      return;
    }

    if (newImageFile) {
      try {
        setIsUploadingImage(true);
        await apiClient.replaceArtworkImage(user.domainId, artwork.id, newImageFile);
        setNewImageFile(null);
        if (imagePreviewUrl) {
          URL.revokeObjectURL(imagePreviewUrl);
          setImagePreviewUrl(null);
        }
      } catch (uploadErr) {
        setError(uploadErr instanceof Error ? uploadErr.message : 'Failed to upload new image');
        setIsUploadingImage(false);
        return;
      }
    }

    setIsUploadingImage(false);
    updateMutation.mutate(updates);
  };

  useEffect(() => {
    return () => {
      if (editingSource && editingSource.startsWith('blob:')) {
        URL.revokeObjectURL(editingSource);
      }
    };
  }, [editingSource]);

  const handleChangeImageClick = () => {
    imageInputRef.current?.click();
  };

  const openImageEditor = useCallback((source: string, fileName: string) => {
    if (editingSource && editingSource.startsWith('blob:')) {
      URL.revokeObjectURL(editingSource);
    }
    setEditingSource(source);
    setEditingFileName(fileName);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setIsEditingImage(true);
  }, [editingSource]);

  const handleEditExistingImage = async () => {
    if (!artwork.filename) return;
    try {
      setIsPreparingEdit(true);
      const response = await fetch(artwork.filename, { mode: 'cors' });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      openImageEditor(objectUrl, `artwork-${artwork.id}.${blob.type.split('/')[1] || 'jpg'}`);
    } catch (err) {
      console.error('Failed to load artwork image for editing', err);
      setError('Unable to edit this image. Please try uploading a new file.');
    } finally {
      setIsPreparingEdit(false);
    }
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }

    setNewImageFile(null);
    const objectUrl = URL.createObjectURL(file);
    openImageEditor(objectUrl, file.name || `artwork-${artwork.id}.jpg`);
    event.target.value = '';
  };

  const handleCancelImageEditing = () => {
    setIsEditingImage(false);
    if (editingSource && editingSource.startsWith('blob:')) {
      URL.revokeObjectURL(editingSource);
    }
    setEditingSource(null);
    setCroppedAreaPixels(null);
    setIsApplyingEdits(false);
  };

  const handleApplyImageEdits = async () => {
    if (!editingSource || !croppedAreaPixels) {
      setError('Please adjust the crop area before applying.');
      return;
    }
    try {
      setIsApplyingEdits(true);
      const blob = await getCroppedImg(editingSource, croppedAreaPixels, rotation);
      const extension = editingFileName.split('.').pop();
      const sanitizedName = editingFileName.replace(/\.[^/.]+$/, '');
      const finalName = `${sanitizedName || 'artwork-edit'}.${extension || 'jpg'}`;
      const file = new File([blob], finalName, { type: blob.type || 'image/jpeg' });
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
      setNewImageFile(file);
      setIsEditingImage(false);
      if (editingSource && editingSource.startsWith('blob:')) {
        URL.revokeObjectURL(editingSource);
      }
      setEditingSource(null);
    } catch (err) {
      console.error('Failed to apply image edits', err);
      setError('Failed to apply image edits. Please try again.');
    } finally {
      setIsApplyingEdits(false);
    }
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
                    <div className="aspect-[3/4] w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200 sticky top-0 relative">
                        {isPreparingEdit && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                                <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                            </div>
                        )}
                        {artwork.filename ? (
                            <img 
                                src={imagePreviewUrl || artwork.thumbnails?.[2]?.url || artwork.filename} 
                                alt={artwork.title} 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">No Image</div>
                        )}
                        <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 z-30">
                            {artwork.filename && (
                                <button
                                    type="button"
                                    onClick={handleEditExistingImage}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-gray-700 shadow hover:bg-white disabled:opacity-60"
                                    disabled={isPreparingEdit}
                                >
                                    Edit current image
                                </button>
                            )}
                            <button
                              type="button"
                              onClick={handleChangeImageClick}
                              className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-700 shadow hover:bg-white disabled:opacity-60"
                              disabled={isPreparingEdit}
                            >
                              <UploadIcon className="w-4 h-4" />
                              Upload new image
                            </button>
                        </div>
                        {newImageFile && (
                          <div className="absolute top-3 right-3 rounded-full bg-purple-600/90 text-xs font-semibold text-white px-2 py-0.5 shadow">
                            New image selected
                          </div>
                        )}
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleImageFileChange}
                        />
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
                        <div className="mt-4 rounded-lg border border-purple-100 bg-white/80 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                            <Sparkles className="w-4 h-4" />
                            Taster availability
                          </div>
                          <div className="mt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-gray-600">
                            <p>Control whether this artwork can appear in the Taster experience for your collectors.</p>
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={useForTaster}
                                onChange={(e) => setUseForTaster(e.target.checked)}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              />
                              {useForTaster ? 'Included in Taster' : 'Not in Taster'}
                            </label>
                          </div>
                        </div>
                        {canEditPrivacy && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-white/90 p-4">
                            <div className="flex items-start gap-3">
                              <div className="rounded-full bg-gray-100 p-2 text-gray-600">
                                <Lock className="w-4 h-4" />
                              </div>
                              <div className="flex-1 space-y-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">Visibility</p>
                                  <p className="text-xs text-gray-500">
                                    Private works are only visible to you and customers you personally invite. Domain owners and admins can always review them.
                                  </p>
                                </div>
                                <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isPrivate}
                                    onChange={(e) => setIsPrivate(e.target.checked)}
                                    className="rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                                  />
                                  {isPrivate ? 'Restrict to my invitees' : 'Share with my full domain'}
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
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
                disabled={updateMutation.isPending || isUploadingImage}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" />
                {updateMutation.isPending || isUploadingImage ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
      </div>
      {isEditingImage && editingSource && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleCancelImageEditing}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              aria-label="Close editor"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pr-8">Adjust Artwork Image</h3>
            <div className="relative w-full h-[55vh] bg-gray-900 rounded-xl overflow-hidden">
              <Cropper
                image={editingSource}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={3 / 4}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
              />
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs uppercase font-semibold text-gray-500 mb-1 block">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRotationChange(-90)}
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                    aria-label="Rotate left"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotationChange(90)}
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                    aria-label="Rotate right"
                  >
                    <RotateCw className="w-5 h-5" />
                  </button>
                </div>
                <span className="text-sm font-medium text-gray-600">{rotation}°</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelImageEditing}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImageEdits}
                disabled={isApplyingEdits}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isApplyingEdits ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply edits'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

const getRadianAngle = (degreeValue: number) => (degreeValue * Math.PI) / 180;

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area, rotation = 0): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.putImageData(data, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.95,
    );
  });
}

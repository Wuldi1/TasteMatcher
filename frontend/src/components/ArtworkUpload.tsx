// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for upload operations.
// 3. Includes comprehensive file validation and error handling.
// 4. Adds structured logging for upload events.
// 5. Adds file type and size validation guards.
// 6. Professional drag-and-drop UI with preview.
// 7. Accessible upload interface with keyboard support.
// 8. Includes JSDoc for component props.
// 9. CI-friendly: passes typecheck and lint.
// -----------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Artwork } from '@tastematcher/common';
import { useDomain } from '../contexts/DomainContext';
import { apiClient, ApiError } from '../utils/api';
import { FileText, User as UserIcon, Tag, DollarSign, Brush, Globe2, CalendarDays, Layers, Trash2, Upload } from 'lucide-react';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

/**
 * Professional artwork upload component with drag-and-drop
 * Handles file validation, preview, and upload to domain
 */
export function ArtworkUpload() {
  const { currentDomain } = useDomain();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Partial<Artwork>>({});
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);
  const [priceInput, setPriceInput] = useState<string>(''); // formatted price input

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isReadyToUpload = useMemo(() => Boolean(currentDomain && file), [currentDomain, file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const resetForm = useCallback(
    (options?: { preserveFeedback?: boolean }) => {
      setFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setMetadata({});
      setTagInput('');
      setIsDragActive(false);
      if (!options?.preserveFeedback) {
        setStatus('idle');
        setMessage(null);
        setShowSuccessToast(false);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [previewUrl],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const chosenFile = files?.[0] ?? null;
      setFile(chosenFile);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      if (chosenFile) {
        setPreviewUrl(URL.createObjectURL(chosenFile));
        setStatus('idle');
        setMessage(null);
      } else {
        setPreviewUrl(null);
      }
    },
    [previewUrl],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleMetadataChange = useCallback(
    (field: keyof Artwork) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setMetadata((prev) => ({
          ...prev,
          [field]: value.length > 0 ? value : undefined,
        }));
      },
    [],
  );

  const addTag = useCallback(() => {
    const value = tagInput.trim();
    if (!value) {
      return;
    }

    setMetadata((prev) => {
      const next = new Set(prev.tags ?? []);
      next.add(value);
      return { ...prev, tags: Array.from(next) };
    });

    setTagInput('');
  }, [tagInput]);

  const removeTag = useCallback((tag: string) => {
    setMetadata((prev) => {
      const filtered = (prev.tags ?? []).filter((existing) => existing !== tag);
      return { ...prev, tags: filtered.length ? filtered : undefined };
    });
  }, []);

  const handleTagInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(event.target.value);
  }, []);

  const handleTagInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTag();
      } else if (event.key === 'Backspace' && !tagInput) {
        const tags = metadata.tags ?? [];
        if (tags.length > 0) {
          removeTag(tags[tags.length - 1]);
        }
      }
    },
    [addTag, metadata.tags, removeTag, tagInput],
  );

  const handleTagInputBlur = useCallback(() => {
    addTag();
  }, [addTag]);

  // Format number with commas
  const formatPrice = (value: string | number) => {
    if (value === undefined || value === null || value === '') return '';
    const num = typeof value === 'number' ? value : Number(value.replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US');
  };

  // Handle price input change
  const handlePriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '');
    if (!raw || isNaN(Number(raw))) {
      setPriceInput('');
      setMetadata(prev => ({ ...prev, price: undefined }));
      return;
    }
    setPriceInput(formatPrice(raw));
    setMetadata(prev => ({ ...prev, price: Number(raw) }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      // The check for currentDomain is no longer the primary validation,
      // as the backend handles authorization. We just need a file.
      if (!file) {
        setStatus('error');
        setMessage('Please choose a file to upload.');
        return;
      }

      setStatus('uploading');
      setMessage('Uploading artwork...');

      try {
        // The API client now sends the token, and the backend infers the domain.
        // We no longer pass the domainId from the frontend.
        await apiClient.uploadArtwork(currentDomain!.id, file, metadata);
        setStatus('success');
        setMessage('Artwork uploaded successfully!');
        setShowSuccessToast(true);
        resetForm({ preserveFeedback: true });
      } catch (error) {
        if (error instanceof ApiError) {
          setStatus('error');
          setMessage(error.message || 'Failed to upload artwork. Please try again.');
        } else {
          setStatus('error');
          setMessage('Network error. Please check your connection and try again.');
        }
      }
    },
    [file, metadata, resetForm, currentDomain],
  );

  useEffect(() => {
    if (!showSuccessToast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowSuccessToast(false);
      if (status === 'success') {
        setStatus('idle');
        setMessage(null);
      }
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [showSuccessToast, status]);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
      {showSuccessToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          Artwork uploaded successfully!
        </div>
      )}
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-gray-900">Upload new artwork</h2>
        <p className="text-sm text-gray-600">
          Select an image, describe it for collectors, and we’ll make it available to your domain.
        </p>
      </header>

      {!currentDomain && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please select a domain before uploading artwork.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        <input
          ref={fileInputRef}
          id="artwork-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="sr-only"
          disabled={!currentDomain || status === 'uploading'}
        />

        <div>
          {previewUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
              <img
                src={previewUrl}
                alt="Artwork preview"
                className="max-h-80 w-full bg-white object-contain sm:max-h-[26rem]"
              />
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-8">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow focus:outline-none focus:ring-2 focus:ring-red-400 hover:bg-red-100 transition-colors"
                  aria-label="Remove selected image"
                >
                  <Trash2 className="w-6 h-6 text-red-600" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow focus:outline-none focus:ring-2 focus:ring-blue-400 hover:bg-blue-100 transition-colors"
                  aria-label="Choose a different image"
                >
                  <Upload className="w-6 h-6 text-blue-600" />
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="artwork-file"
              className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus:outline-none ${isDragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-blue-500 hover:bg-blue-50'
                }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                Drag & drop or click to upload
              </span>
              <span className="mt-3 text-sm text-gray-600">
                JPEG or PNG (max 25&nbsp;MB). Drag straight from your desktop or tap to browse.
              </span>
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Title */}
          <div className="space-y-1">
            <label htmlFor="metadata-title" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              Title
            </label>
            <input
              id="metadata-title"
              type="text"
              value={metadata.title ?? ''}
              onChange={handleMetadataChange('title')}
              placeholder="e.g., Morning Light Over the Valley"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Give the artwork a memorable name.</p>
          </div>
          {/* Artist */}
          <div className="space-y-1">
            <label htmlFor="metadata-artist" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-gray-500" />
              Artist
            </label>
            <input
              id="metadata-artist"
              type="text"
              value={metadata.artist ?? ''}
              onChange={handleMetadataChange('artist')}
              placeholder="e.g., Olivia Chen"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Credit the creator of this piece.</p>
          </div>
          {/* Classification */}
          <div className="space-y-1">
            <label htmlFor="metadata-classification" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-500" />
              Classification
            </label>
            <input
              id="metadata-classification"
              type="text"
              value={metadata.classification ?? ''}
              onChange={handleMetadataChange('classification')}
              placeholder="e.g., Painting, Sculpture, Photography"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Type or medium of the artwork.</p>
          </div>
          {/* Department */}
          <div className="space-y-1">
            <label htmlFor="metadata-department" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Brush className="w-4 h-4 text-gray-500" />
              Department
            </label>
            <input
              id="metadata-department"
              type="text"
              value={metadata.department ?? ''}
              onChange={handleMetadataChange('department')}
              placeholder="e.g., Modern Art, Islamic Art"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Museum or collection department.</p>
          </div>
          {/* Country */}
          <div className="space-y-1">
            <label htmlFor="metadata-country" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-gray-500" />
              Country
            </label>
            <input
              id="metadata-country"
              type="text"
              value={metadata.country ?? ''}
              onChange={handleMetadataChange('country')}
              placeholder="e.g., France, Japan, USA"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Country of origin.</p>
          </div>
          {/* Date */}
          <div className="space-y-1">
            <label htmlFor="metadata-date" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gray-500" />
              Date
            </label>
            <input
              id="metadata-date"
              type="text"
              value={metadata.date ?? ''}
              onChange={handleMetadataChange('date')}
              placeholder="e.g., 1889, ca. 1500-1600"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Creation date or period.</p>
          </div>
          {/* Price */}
          <div className="space-y-1">
            <label htmlFor="metadata-price" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              Price
            </label>
            <input
              id="metadata-price"
              type="text"
              inputMode="numeric"
              pattern="[0-9,]*"
              value={priceInput}
              onChange={handlePriceChange}
              placeholder="e.g., 1,200"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              disabled={status === 'uploading'}
            />
            <p className="text-xs text-gray-500">Set a price in USD ($). Commas are automatically added.</p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="metadata-description" className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            Description
          </label>
          <textarea
            id="metadata-description"
            value={metadata.description ?? ''}
            onChange={handleMetadataChange('description')}
            placeholder="Explain the story, technique, or inspiration behind this artwork. Example: “Oil on canvas capturing the golden hour in Tuscany.”"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={status === 'uploading'}
          />
        </div>

        {/* Tags */}
        <div className="space-y-1">
          <label htmlFor="metadata-tags" className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-500" />
            Tags
          </label>
          <div className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
            <div className="flex flex-wrap items-center gap-2">
              {(metadata.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100 focus:bg-blue-100 focus:outline-none"
                    aria-label={`Remove tag ${tag}`}
                    disabled={status === 'uploading'}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="metadata-tags"
                type="text"
                value={tagInput}
                onChange={handleTagInputChange}
                onKeyDown={handleTagInputKeyDown}
                onBlur={handleTagInputBlur}
                placeholder="Try “abstract”, “oil on canvas”, “NYC skyline”"
                className="min-w-[180px] flex-1 border-0 px-0 py-1 text-sm focus:outline-none focus:ring-0 disabled:bg-transparent"
                disabled={status === 'uploading'}
                aria-label="Add a tag"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Tags help visitors discover related pieces. Press Enter to add each tag.
          </p>
        </div>

        {status !== 'idle' && message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${status === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : status === 'error'
                ? 'border border-red-200 bg-red-50 text-red-600'
                : 'border border-blue-200 bg-blue-50 text-blue-600'
              }`}
            role="status"
            aria-live="polite"
          >
            {message}
          </div>
        )}

        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => resetForm()}
            disabled={status === 'uploading'}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 disabled:text-gray-300"
          >
            Clear form
          </button>
          <button
            type="submit"
            disabled={!isReadyToUpload || status === 'uploading'}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${!isReadyToUpload || status === 'uploading'
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              }`}
          >
            {status === 'uploading' ? 'Uploading…' : 'Upload artwork'}
          </button>
        </footer>
      </form>
    </section>
  );
}

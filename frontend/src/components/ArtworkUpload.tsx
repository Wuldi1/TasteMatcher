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

import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomain } from '../contexts/DomainContext';
import { apiClient, ApiError } from '../services/api';
import { ArtworkMetadata } from 'common';

interface UploadFormData {
  title: string;
  artist: string;
  category: string;
  tags: string;
}

interface UploadState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  progress: number;
  success: boolean;
  error: string | null;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Professional artwork upload component with drag-and-drop
 * Handles file validation, preview, and upload to domain
 */
export function ArtworkUpload() {
  const navigate = useNavigate();
  const { currentDomain, setCurrentDomain } = useDomain();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<UploadFormData>({
    title: '',
    artist: '',
    category: '',
    tags: '',
  });

  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    preview: null,
    uploading: false,
    progress: 0,
    success: false,
    error: null,
  });

  const [dragActive, setDragActive] = useState(false);

  // Redirect if no domain is authenticated
  React.useEffect(() => {
    if (!currentDomain) {
      navigate('/');
    }
  }, [currentDomain, navigate]);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Please upload a JPEG, PNG, or WebP image';
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 25MB';
    }

    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    
    if (error) {
      setUploadState(prev => ({ ...prev, error, file: null, preview: null }));
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadState(prev => ({
        ...prev,
        file,
        preview: e.target?.result as string,
        error: null,
      }));
    };
    reader.readAsDataURL(file);

    console.debug('File Selected:', { 
      name: file.name, 
      size: file.size, 
      type: file.type 
    });
  }, [validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFormChange = useCallback((field: keyof UploadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleUpload = useCallback(async () => {
    if (!uploadState.file || !currentDomain) {
      return;
    }

    setUploadState(prev => ({ ...prev, uploading: true, progress: 0, error: null }));

    console.info('Upload Started:', { 
      domainId: currentDomain.id,
      fileName: uploadState.file.name,
      fileSize: uploadState.file.size 
    });

    try {
      const metadata: ArtworkMetadata = {
        title: formData.title.trim() || undefined,
        artist: formData.artist.trim() || undefined,
        category: formData.category.trim() || undefined,
        tags: formData.tags.trim() ? formData.tags.split(',').map(t => t.trim()) : undefined,
      };

      // Simulate progress (real implementation would use XMLHttpRequest with progress events)
      const progressInterval = setInterval(() => {
        setUploadState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90)
        }));
      }, 200);

      const result = await apiClient.uploadArtwork(
        currentDomain.id,
        uploadState.file,
        metadata
      );

      clearInterval(progressInterval);
      
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        success: true,
      }));

      console.info('Upload Success:', { 
        domainId: currentDomain.id,
        artId: result.artId 
      });

      // Reset form after successful upload
      setTimeout(() => {
        setUploadState({
          file: null,
          preview: null,
          uploading: false,
          progress: 0,
          success: false,
          error: null,
        });
        setFormData({
          title: '',
          artist: '',
          category: '',
          tags: '',
        });
      }, 3000);

    } catch (error) {
      console.error('Upload Error:', error);
      
      let errorMessage = 'Upload failed. Please try again.';
      if (error instanceof ApiError) {
        if (error.status === 400) {
          errorMessage = 'Invalid file or data. Please check your input.';
        } else if (error.status === 413) {
          errorMessage = 'File is too large. Please use a smaller file.';
        }
      }

      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 0,
        error: errorMessage,
      }));
    }
  }, [uploadState.file, currentDomain, formData]);

  const handleLogout = useCallback(() => {
    setCurrentDomain(null);
    navigate('/');
  }, [setCurrentDomain, navigate]);

  if (!currentDomain) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {currentDomain.name}
              </h1>
              <p className="text-gray-600">{currentDomain.adminEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Switch Domain
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Area */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Upload Artwork
            </h2>

            {/* Drag and Drop Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : uploadState.file
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {uploadState.preview ? (
                <div className="space-y-4">
                  <img
                    src={uploadState.preview}
                    alt="Preview"
                    className="max-h-48 mx-auto rounded-lg shadow-sm"
                  />
                  <p className="text-sm text-gray-600">
                    {uploadState.file?.name}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Choose different file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-4xl text-gray-400">📸</div>
                  <div>
                    <p className="text-lg text-gray-600 mb-2">
                      Drag and drop your artwork here
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      or
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Choose File
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    JPEG, PNG, or WebP • Max 25MB
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Upload Progress */}
            {uploadState.uploading && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadState.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadState.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {uploadState.success && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  ✅ Artwork uploaded successfully! Processing will begin shortly.
                </p>
              </div>
            )}

            {/* Error Message */}
            {uploadState.error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{uploadState.error}</p>
              </div>
            )}
          </div>

          {/* Metadata Form */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Artwork Details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Artwork title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Artist
                </label>
                <input
                  type="text"
                  value={formData.artist}
                  onChange={(e) => handleFormChange('artist', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Artist name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleFormChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select category</option>
                  <option value="painting">Painting</option>
                  <option value="sculpture">Sculpture</option>
                  <option value="photography">Photography</option>
                  <option value="digital">Digital Art</option>
                  <option value="mixed-media">Mixed Media</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => handleFormChange('tags', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="tag1, tag2, tag3"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate tags with commas
                </p>
              </div>

              <button
                onClick={handleUpload}
                disabled={!uploadState.file || uploadState.uploading}
                className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                  !uploadState.file || uploadState.uploading
                    ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {uploadState.uploading ? 'Uploading...' : 'Upload Artwork'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

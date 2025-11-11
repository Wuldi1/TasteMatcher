import React, { useState, useCallback } from 'react';
import { ArtworkPreferences } from '@tastematcher/common';

interface ArtworkPreferencesStepProps {
  data: ArtworkPreferences;
  onChange: (data: ArtworkPreferences) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ArtworkPreferencesStep({ data, onChange, onNext, onBack }: ArtworkPreferencesStepProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const handleChange = useCallback((field: keyof ArtworkPreferences, value: any) => {
    onChange({ ...data, [field]: value });
  }, [data, onChange]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 5 images
    const newFiles = [...uploadedFiles, ...files].slice(0, 5);
    setUploadedFiles(newFiles);

    // Create preview URLs
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newPreviews);

    // Store file references (in real implementation, these would be uploaded to temp storage)
    handleChange('referenceImageUrls', newPreviews);
  }, [uploadedFiles, handleChange]);

  const handleRemoveImage = useCallback((index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = previewUrls.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setPreviewUrls(newPreviews);
    handleChange('referenceImageUrls', newPreviews);
  }, [uploadedFiles, previewUrls, handleChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            What Are You Looking For?
          </h2>
          <p className="text-gray-600">
            Help us understand the type of artwork you'd like to discover
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
              Describe the type of artwork you're interested in
            </label>
            <textarea
              id="description"
              value={data.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={5}
              placeholder="e.g., I'm drawn to vibrant abstract paintings with bold colors, or minimalist photography that captures urban landscapes..."
            />
            <p className="mt-1 text-xs text-gray-500">Optional - but helps us make better recommendations</p>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-4">
              Share reference images (optional)
            </label>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">Privacy Note:</span> These images are used only to train our AI to understand your taste. 
                They are not stored permanently—only processed for vectorization.
              </p>
            </div>

            {previewUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                {previewUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Reference ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {previewUrls.length < 5 && (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <p className="text-sm text-gray-500">
                    Click to upload images ({previewUrls.length}/5)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB each</p>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transition-all"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

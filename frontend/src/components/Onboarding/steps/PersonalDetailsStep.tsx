import React, { useState } from 'react';
import { PersonalDetails } from '@tastematcher/common';

interface PersonalDetailsStepProps {
  data: PersonalDetails;
  onChange: (data: PersonalDetails) => void;
  onNext: () => void;
  onBack: () => void;
}

export function PersonalDetailsStep({ data, onChange, onNext, onBack }: PersonalDetailsStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof PersonalDetails, value: any) => {
    onChange({ ...data, [field]: value });
    setErrors({ ...errors, [field]: '' });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.location?.trim()) {
      newErrors.location = 'Primary location is required';
    }

    if (!data.profession?.trim()) {
      newErrors.profession = 'Professional field is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onNext();
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Let's Get to Know You
          </h2>
          <p className="text-gray-600">
            Tell us a bit about yourself and your background
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Required Fields */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="text-sm font-medium text-blue-900">Required Information</p>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-semibold text-gray-700 mb-2">
              Where are you based? <span className="text-red-500">*</span>
            </label>
            <input
              id="location"
              type="text"
              value={data.location || ''}
              onChange={(e) => handleChange('location', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.location ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., New York, NY"
            />
            {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
          </div>

          <div>
            <label htmlFor="profession" className="block text-sm font-semibold text-gray-700 mb-2">
              What field are you in professionally? <span className="text-red-500">*</span>
            </label>
            <input
              id="profession"
              type="text"
              value={data.profession || ''}
              onChange={(e) => handleChange('profession', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.profession ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Technology entrepreneur, Attorney, Artist"
            />
            {errors.profession && <p className="mt-1 text-sm text-red-600">{errors.profession}</p>}
          </div>

          {/* Optional Fields */}
          <div className="bg-gray-50 border-l-4 border-gray-400 p-4 mt-8 mb-6">
            <p className="text-sm font-medium text-gray-700">Optional Details</p>
          </div>

          <div>
            <label htmlFor="secondaryLocations" className="block text-sm font-semibold text-gray-700 mb-2">
              Do you split time between other locations?
            </label>
            <input
              id="secondaryLocations"
              type="text"
              value={data.secondaryLocations?.join(', ') || ''}
              onChange={(e) => handleChange('secondaryLocations', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., London, Miami"
            />
            <p className="mt-1 text-xs text-gray-500">Separate multiple locations with commas</p>
          </div>

          <div>
            <label htmlFor="culturalInfluences" className="block text-sm font-semibold text-gray-700 mb-2">
              Cultural, academic, or travel influences that shape your taste?
            </label>
            <textarea
              id="culturalInfluences"
              value={data.culturalInfluences || ''}
              onChange={(e) => handleChange('culturalInfluences', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="e.g., Studied art history in Italy, frequent trips to Japan..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="maritalStatus" className="block text-sm font-semibold text-gray-700 mb-2">
                Marital Status
              </label>
              <select
                id="maritalStatus"
                value={data.maritalStatus || ''}
                onChange={(e) => handleChange('maritalStatus', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="partnered">Partnered</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="hasChildren" className="block text-sm font-semibold text-gray-700 mb-2">
                Do you have children?
              </label>
              <select
                id="hasChildren"
                value={data.hasChildren === undefined ? '' : data.hasChildren ? 'yes' : 'no'}
                onChange={(e) => {
                  const hasChildren = e.target.value === 'yes';
                  handleChange('hasChildren', hasChildren);
                  if (!hasChildren) {
                    handleChange('numberOfChildren', undefined);
                  }
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          {data.hasChildren && (
            <div>
              <label htmlFor="numberOfChildren" className="block text-sm font-semibold text-gray-700 mb-2">
                How many children?
              </label>
              <input
                id="numberOfChildren"
                type="number"
                min="1"
                value={data.numberOfChildren || ''}
                onChange={(e) => handleChange('numberOfChildren', parseInt(e.target.value) || undefined)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="residences" className="block text-sm font-semibold text-gray-700 mb-2">
              Where do you own residences?
            </label>
            <input
              id="residences"
              type="text"
              value={data.residences?.join(', ') || ''}
              onChange={(e) => handleChange('residences', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Manhattan apartment, Hamptons house"
            />
            <p className="mt-1 text-xs text-gray-500">Separate multiple residences with commas</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="currentlyCollects" className="block text-sm font-semibold text-gray-700 mb-2">
                Do you currently collect art?
              </label>
              <select
                id="currentlyCollects"
                value={data.currentlyCollects === undefined ? '' : data.currentlyCollects ? 'yes' : 'no'}
                onChange={(e) => {
                  const collects = e.target.value === 'yes';
                  handleChange('currentlyCollects', collects);
                  if (!collects) {
                    handleChange('currentCollection', undefined);
                  }
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label htmlFor="familyCollects" className="block text-sm font-semibold text-gray-700 mb-2">
                Does your family collect?
              </label>
              <select
                id="familyCollects"
                value={data.familyCollects === undefined ? '' : data.familyCollects ? 'yes' : 'no'}
                onChange={(e) => handleChange('familyCollects', e.target.value === 'yes')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          {data.currentlyCollects && (
            <div>
              <label htmlFor="currentCollection" className="block text-sm font-semibold text-gray-700 mb-2">
                What works do you currently own?
              </label>
              <textarea
                id="currentCollection"
                value={data.currentCollection || ''}
                onChange={(e) => handleChange('currentCollection', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                placeholder="Describe your current collection..."
              />
            </div>
          )}

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

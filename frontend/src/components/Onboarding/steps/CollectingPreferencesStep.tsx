import React from 'react';
import { CollectingPreferences } from '@tastematcher/common';

interface CollectingPreferencesStepProps {
  data: CollectingPreferences;
  onChange: (data: CollectingPreferences) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CollectingPreferencesStep({ data, onChange, onNext, onBack }: CollectingPreferencesStepProps) {
  const handleChange = (field: keyof CollectingPreferences, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Your Collecting Journey
          </h2>
          <p className="text-gray-600">
            Share your art collecting experiences and preferences (all optional)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="themes" className="block text-sm font-semibold text-gray-700 mb-2">
              What themes or ideas draw you to artworks you may want to collect?
            </label>
            <textarea
              id="themes"
              value={data.themes || ''}
              onChange={(e) => handleChange('themes', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="e.g., Nature, identity, social commentary, abstract expression..."
            />
          </div>

          <div>
            <label htmlFor="artistsOrMovements" className="block text-sm font-semibold text-gray-700 mb-2">
              Which artists or movements are you most interested in?
            </label>
            <textarea
              id="artistsOrMovements"
              value={data.artistsOrMovements || ''}
              onChange={(e) => handleChange('artistsOrMovements', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="e.g., Contemporary abstract, Impressionism, emerging Latin American artists..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Do you consider your collecting style more...
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['conceptual', 'aesthetic', 'research-based', 'intuitive', 'mixed'].map((style) => (
                <label
                  key={style}
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    data.collectingStyle === style
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="collectingStyle"
                    value={style}
                    checked={data.collectingStyle === style}
                    onChange={(e) => handleChange('collectingStyle', e.target.value)}
                    className="mr-3 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="capitalize font-medium text-gray-900">{style}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="displayLocations" className="block text-sm font-semibold text-gray-700 mb-2">
              Where do you display works?
            </label>
            <input
              id="displayLocations"
              type="text"
              value={data.displayLocations?.join(', ') || ''}
              onChange={(e) => handleChange('displayLocations', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Home, Office, Multiple residences"
            />
            <p className="mt-1 text-xs text-gray-500">Separate multiple locations with commas</p>
          </div>

          <div>
            <label htmlFor="startedCollecting" className="block text-sm font-semibold text-gray-700 mb-2">
              When did you start collecting?
            </label>
            <input
              id="startedCollecting"
              type="text"
              value={data.startedCollecting || ''}
              onChange={(e) => handleChange('startedCollecting', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 2015, 5 years ago"
            />
          </div>

          <div>
            <label htmlFor="firstAcquisition" className="block text-sm font-semibold text-gray-700 mb-2">
              What was your first acquisition and why?
            </label>
            <textarea
              id="firstAcquisition"
              value={data.firstAcquisition || ''}
              onChange={(e) => handleChange('firstAcquisition', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Tell us about your first piece..."
            />
          </div>

          <div>
            <label htmlFor="evolutionOfFocus" className="block text-sm font-semibold text-gray-700 mb-2">
              How has your collecting focus evolved?
            </label>
            <textarea
              id="evolutionOfFocus"
              value={data.evolutionOfFocus || ''}
              onChange={(e) => handleChange('evolutionOfFocus', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Describe how your taste has changed..."
            />
          </div>

          <div>
            <label htmlFor="mentorsOrAdvisors" className="block text-sm font-semibold text-gray-700 mb-2">
              Mentors, curators, or advisors who influenced your taste?
            </label>
            <textarea
              id="mentorsOrAdvisors"
              value={data.mentorsOrAdvisors || ''}
              onChange={(e) => handleChange('mentorsOrAdvisors', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="eventsAttended" className="block text-sm font-semibold text-gray-700 mb-2">
              Do you attend gallery shows, fairs, biennales, or museum exhibitions? Which ones?
            </label>
            <textarea
              id="eventsAttended"
              value={data.eventsAttended || ''}
              onChange={(e) => handleChange('eventsAttended', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="e.g., Art Basel, Frieze, local gallery openings..."
            />
          </div>

          <div>
            <label htmlFor="museumBoards" className="block text-sm font-semibold text-gray-700 mb-2">
              Do you sit on any museum boards or young collector councils?
            </label>
            <input
              id="museumBoards"
              type="text"
              value={data.museumBoards || ''}
              onChange={(e) => handleChange('museumBoards', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="artistEngagement" className="block text-sm font-semibold text-gray-700 mb-2">
              Do you follow artists' practices (studio visits, research, reading, etc.)?
            </label>
            <textarea
              id="artistEngagement"
              value={data.artistEngagement || ''}
              onChange={(e) => handleChange('artistEngagement', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Describe how you engage with artists..."
            />
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

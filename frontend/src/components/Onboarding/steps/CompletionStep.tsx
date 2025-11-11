import React from 'react';

interface CompletionStepProps {
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function CompletionStep({ onComplete, onBack, isSubmitting }: CompletionStepProps) {
  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10 text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            You're All Set!
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Thank you for sharing your story with us. We're ready to help you discover art that resonates with your unique taste.
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 sm:p-8 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">What happens next?</h3>
          <div className="space-y-4 text-left max-w-md mx-auto">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold mr-3">
                1
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Start Swiping</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Browse artworks and swipe to build your taste profile
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-semibold mr-3">
                2
              </div>
              <div>
                <h4 className="font-medium text-gray-900">AI Learning</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Our AI learns your preferences with every interaction
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-500 text-white rounded-full flex items-center justify-center font-semibold mr-3">
                3
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Get Matched</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Receive personalized artwork recommendations from galleries
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={isSubmitting}
            className="flex-1 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-lg shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              'Complete Onboarding'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

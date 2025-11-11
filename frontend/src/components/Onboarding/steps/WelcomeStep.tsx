import React from 'react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-12 text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-6 animate-bounce-slow">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Welcome to TasteMatcher
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Your personal AI-powered art discovery companion
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 sm:p-8 mb-8 text-left">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">How TasteMatcher Works</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold mr-4">
                1
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Tell Us About You</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Share your background, collecting journey, and what inspires you
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-semibold mr-4">
                2
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Swipe & Discover</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Our AI learns your taste as you explore curated artworks
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-500 text-white rounded-full flex items-center justify-center font-semibold mr-4">
                3
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Get Personalized Matches</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Receive recommendations tailored specifically to your unique aesthetic
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Privacy Note:</span> Your responses help us understand your taste. 
            Any images you share are only used to train our AI—we don't store them permanently.
          </p>
        </div>

        <button
          onClick={onNext}
          className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-xl shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          Let's Get Started
        </button>

        <p className="mt-6 text-sm text-gray-500">
          This will take about 5-10 minutes
        </p>
      </div>
    </div>
  );
}

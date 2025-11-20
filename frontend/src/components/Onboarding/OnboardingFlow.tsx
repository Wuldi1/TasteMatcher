import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PersonalDetails, CollectingPreferences, ArtworkPreferences, User } from '@tastematcher/common';
import { WelcomeStep } from './steps/WelcomeStep';
import { PersonalDetailsStep } from './steps/PersonalDetailsStep';
import { CollectingPreferencesStep } from './steps/CollectingPreferencesStep';
import { ArtworkPreferencesStep } from './steps/ArtworkPreferencesStep';
import { CompletionStep } from './steps/CompletionStep';
import { apiClient, ApiError } from '../../utils/api';

type OnboardingStep = 'welcome' | 'personal' | 'collecting' | 'artwork' | 'completion';

/**
 * Onboarding flow for new customer users
 * Multi-step questionnaire with image upload and vectorization
 */
export function OnboardingFlow() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails>({});
  const [collectingPreferences, setCollectingPreferences] = useState<CollectingPreferences>({});
  const [artworkPreferences, setArtworkPreferences] = useState<ArtworkPreferences>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user should even be on this page
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // If user is not a customer, redirect to home
    if (user.role !== 'customer') {
      navigate('/home', { replace: true });
      return;
    }

    // If user hasn't started or is in progress, they should be here
    if (user.onboardingStatus === 'not_started' || user.onboardingStatus === 'in_progress') {
      setIsLoading(false);
      return;
    }

    // If user has completed or skipped, they're editing
    if (user.onboardingStatus === 'completed' || user.onboardingStatus === 'skipped') {
      setIsEditMode(true);
    }

    setIsLoading(false);
  }, [user, navigate]);

  // Load existing questionnaire data after determining edit mode
  useEffect(() => {
    if (isLoading || !user) return;

    // Only refresh if we're in edit mode to get latest data
    if (isEditMode && refreshUser) {
      refreshUser().then((user: Partial<User>) => {
        console.log('User data refreshed for onboarding edit mode', user);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isLoading]); // Don't include refreshUser or user to avoid loops

  useEffect(() => {
    if (!user?.personalQuestionnaire) return;
    const { personalDetails: pd, collectingPreferences: cp, artworkPreferences: ap } = user.personalQuestionnaire;
    
    if (pd) {
      setPersonalDetails(pd);
    }
    if (cp) {
      setCollectingPreferences(cp);
    }
    if (ap) {
      setArtworkPreferences(ap);
    }
  }, [user?.personalQuestionnaire]);

  const handleNext = useCallback(() => {
    const steps: OnboardingStep[] = ['welcome', 'personal', 'collecting', 'artwork', 'completion'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    const steps: OnboardingStep[] = ['welcome', 'personal', 'collecting', 'artwork', 'completion'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const handleComplete = useCallback(async () => {
    if (!user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Submit questionnaire data
      await apiClient.updateUserQuestionnaire({
        personalDetails,
        collectingPreferences,
        artworkPreferences: {
          description: artworkPreferences.description,
        },
      });

      // Finalize vectors if images were uploaded
      if (artworkPreferences.referenceImageUrls && artworkPreferences.referenceImageUrls.length > 0) {
        await apiClient.finalizePreferenceVectors();
      }

      // Only update onboarding status if NOT in edit mode
      // In edit mode, user already has completed/skipped status
      if (!isEditMode) {
        await apiClient.completeOnboarding();
        await refreshUser?.();
      }

      // Navigate to home with replace to prevent back navigation
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to save your preferences');
    } finally {
      setIsSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, personalDetails, collectingPreferences, artworkPreferences, isEditMode, navigate]);

  const handleSkip = useCallback(async () => {
    if (!user) return;

    // If in edit mode, just navigate back instead of skipping
    if (isEditMode) {
      navigate('/home', { replace: true });
      return;
    }

    setIsSkipping(true);
    setError(null);

    try {
      await apiClient.skipOnboarding();

      // Navigate to home
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Failed to skip onboarding:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to skip onboarding');
    } finally {
      setIsSkipping(false);
    }
  }, [user, isEditMode, navigate]);

  const getProgress = useCallback(() => {
    const steps: OnboardingStep[] = ['welcome', 'personal', 'collecting', 'artwork', 'completion'];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  }, [currentStep]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 z-50">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 ease-out"
          style={{ width: `${getProgress()}%` }}
        />
      </div>

      {/* Skip/Cancel Button - Show on all steps except completion */}
      {currentStep !== 'completion' && (
        <div className="fixed top-4 right-4 z-40">
          <button
            onClick={handleSkip}
            disabled={isSkipping}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white/80 hover:bg-white rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSkipping ? 'Canceling...' : isEditMode ? 'Cancel' : 'Skip for now'}
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {currentStep === 'welcome' && (
          <WelcomeStep onNext={handleNext} />
        )}

        {currentStep === 'personal' && (
          <PersonalDetailsStep
            data={personalDetails}
            onChange={setPersonalDetails}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === 'collecting' && (
          <CollectingPreferencesStep
            data={collectingPreferences}
            onChange={setCollectingPreferences}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === 'artwork' && (
          <ArtworkPreferencesStep
            data={artworkPreferences}
            onChange={setArtworkPreferences}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === 'completion' && (
          <CompletionStep
            onComplete={handleComplete}
            onBack={handleBack}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { NAVIGATION_LINKS } from '../constants/navigation';
import { useAuth } from '../contexts/AuthContext';

const TOUR_STORAGE_KEY = 'welcomeTourCompleted';

export function useWelcomeTour() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);

  // Filter steps based on user role
  const steps = NAVIGATION_LINKS.filter((link) => link.roles.includes(user?.role || '')).map((link) => link.id);

  useEffect(() => {
    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';

    if (!hasCompletedTour && steps.length > 0) {
      setCurrentStep(steps[0]); // Start with the first step
      setIsTourActive(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextStep = () => {
    const currentIndex = steps.indexOf(currentStep!);
    if (currentIndex < steps.length - 1) {
      const next = steps[currentIndex + 1];
      setCurrentStep(next);
    } else {
      completeTour();
    }
  };

  const previousStep = () => {
    const currentIndex = steps.indexOf(currentStep!);
    if (currentIndex > 0) {
      const previous = steps[currentIndex - 1];
      setCurrentStep(previous);
    }
  };

  const skipTour = () => {
    completeTour();
  };

  const completeTour = () => {
    setIsTourActive(false);
    setCurrentStep(null);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  };

  return {
    currentStep,
    isTourActive,
    nextStep,
    previousStep,
    skipTour,
  };
}

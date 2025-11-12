/**
 * Check AI Recommendations eligibility
 * Pure function - safe for both frontend and backend
 * No dependencies on Node.js or NestJS
 */
export function getAIRecommendationsEligibility(
  swipeCount: number,
  onboardingStatus: string
): { isEligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let isEligible = true;

  if (swipeCount < 20) {
    isEligible = false;
    reasons.push('At least 20 swipes required');
  }

  if (onboardingStatus !== 'completed') {
    isEligible = false;
    reasons.push('Complete onboarding to unlock');
  }

  return { isEligible, reasons };
}

import { User } from "@tastematcher/common";

/**
 * Check AI Recommendations eligibility (Frontend version)
 * Pure function with no backend dependencies
 */
export function getAIRecommendationsEligibility(
  user: User
): { isEligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let isEligible = true;

  if ((user.swipeCount || 0) < 20) {
    isEligible = false;
    reasons.push('You need at least 20 swipes to unlock AI suggestions');
  }

  if (user.onboardingStatus !== 'completed') {
    isEligible = false;
    reasons.push('Complete onboarding to unlock AI suggestions');
  }

  return { isEligible, reasons };
}

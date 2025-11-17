import { User } from "../types/user.types";

/**
 * Check AI Recommendations eligibility
 * Pure function - safe for both frontend and backend
 * No dependencies on Node.js or NestJS
 */
export function getAIRecommendationsEligibility(
  user: User
): { isEligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let isEligible = true;

  if ((user.swipeCount || 0) < 20) {
    isEligible = false;
    reasons.push('You need at least 20 swipes to unlock AI recommendations (currently has ' + (user.swipeCount || 0) + ')');
  }

  if (user.onboardingStatus !== 'completed') {
    isEligible = false;
    reasons.push('Complete onboarding to unlock AI recommendations (current status: ' + user.onboardingStatus + ')');
  }

  return { isEligible, reasons };
}

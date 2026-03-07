import { User } from "../types/user.types";

export const AI_RECOMMENDATIONS_MIN_SWIPES = 20;

/**
 * Check AI Recommendations eligibility
 * Pure function - safe for both frontend and backend
 * No dependencies on Node.js or NestJS
 */
export function getAIRecommendationsEligibility(
  user: Pick<User, "swipeCount" | "onboardingStatus">,
): {
  isEligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  let isEligible = true;

  if ((user.swipeCount || 0) < AI_RECOMMENDATIONS_MIN_SWIPES) {
    isEligible = false;
    reasons.push(
      `You need at least ${AI_RECOMMENDATIONS_MIN_SWIPES} swipes to unlock AI recommendations (currently has ` +
        (user.swipeCount || 0) +
        ")",
    );
  }

  if (user.onboardingStatus !== "completed") {
    isEligible = false;
    reasons.push(
      "Complete onboarding to unlock AI recommendations (current status: " +
        user.onboardingStatus +
        ")",
    );
  }

  return { isEligible, reasons };
}

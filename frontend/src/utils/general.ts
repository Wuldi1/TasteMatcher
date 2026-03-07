import { Artwork, User } from "@tastematcher/common";

export const AI_RECOMMENDATIONS_MIN_SWIPES = 20;

/**
 * Check AI Recommendations eligibility (Frontend version)
 * Pure function with no backend dependencies
 */
export function getAIRecommendationsEligibility(user: Partial<User>): {
  isEligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  let isEligible = true;

  if ((user?.swipeCount || 0) < AI_RECOMMENDATIONS_MIN_SWIPES) {
    isEligible = false;
    reasons.push(
      `You need at least ${AI_RECOMMENDATIONS_MIN_SWIPES} swipes to unlock AI suggestions (currently ${user?.swipeCount || 0})`,
    );
  }

  if (user?.onboardingStatus !== "completed") {
    isEligible = false;
    reasons.push(
      `Complete onboarding to unlock AI suggestions (current status: ${user?.onboardingStatus || "not_started"})`,
    );
  }

  return { isEligible, reasons };
}

export const NEW_TAG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const isArtworkNew = (
  artwork: Pick<Artwork, "createdAt">,
  nowMs: number = Date.now(),
  windowMs: number = NEW_TAG_WINDOW_MS,
): boolean => {
  if (typeof artwork?.createdAt !== "number") {
    return false;
  }
  return nowMs - artwork.createdAt < windowMs;
};

export const isAuctionEnded = (
  artwork: Pick<Artwork, "isAuction" | "endDate">,
  nowMs: number = Date.now()
): boolean => {
  if (artwork?.isAuction && artwork?.endDate) {
    return new Date(artwork.endDate).getTime() <= nowMs;
  }
  return false;
};

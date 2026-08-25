import type {
  Artwork,
  ArtworkPreference,
} from "../types/artwork.types";
import type {
  PersonalQuestionnaire,
  User,
} from "../types/user.types";
import { cosineSimilarity } from "./vector.utils";

export interface RecommendationScoreWeights {
  imageSimilarity: number;
  intentScore: number;
  metadataScore: number;
  behaviorScore: number;
}

export interface RecommendationScoreBreakdown {
  imageSimilarity: number;
  intentScore: number;
  metadataScore: number;
  behaviorScore: number;
  finalScore: number;
  reasons: string[];
}

export interface RecommendationBehaviorProfile {
  likedArtists: Set<string>;
  dislikedArtists: Set<string>;
  likedMediumTerms: Set<string>;
  dislikedMediumTerms: Set<string>;
  likedTags: Set<string>;
  dislikedTags: Set<string>;
}

export const DEFAULT_RECOMMENDATION_SCORE_WEIGHTS: RecommendationScoreWeights = {
  imageSimilarity: 0.6,
  intentScore: 0.2,
  metadataScore: 0.15,
  behaviorScore: 0.05,
};

const BUYING_INTEREST_KEYWORDS: Record<string, string[]> = {
  paintings: [
    "painting",
    "paintings",
    "oil",
    "acrylic",
    "watercolor",
    "gouache",
    "canvas",
    "panel",
  ],
  prints: [
    "print",
    "prints",
    "screenprint",
    "lithograph",
    "etching",
    "woodcut",
    "monotype",
    "edition",
  ],
  sculptures: [
    "sculpture",
    "sculptures",
    "bronze",
    "steel",
    "marble",
    "ceramic",
    "cast",
    "installation",
  ],
  photographs: [
    "photograph",
    "photographs",
    "photography",
    "gelatin",
    "silver",
    "c-print",
    "chromogenic",
    "pigment",
  ],
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function hasVectorSignal(vector: number[] | undefined): vector is number[] {
  return Array.isArray(vector) && vector.some((value) => value !== 0);
}

function vectorSimilarity01(
  left: number[] | undefined,
  right: number[] | undefined,
): number | undefined {
  if (!left || !right || left.length !== right.length) {
    return undefined;
  }

  return clamp01((cosineSimilarity(left, right) + 1) / 2);
}

function normalizeTerm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function splitTerms(value: string | undefined): string[] {
  return normalizeTerm(value)
    .split(/[^a-z0-9+-]+/i)
    .map((term) => term.trim())
    .filter(Boolean);
}

function artworkTerms(artwork: Artwork): Set<string> {
  return new Set([
    ...splitTerms(artwork.title),
    ...splitTerms(artwork.description),
    ...splitTerms(artwork.artist),
    ...splitTerms(artwork.medium),
    ...(artwork.tags ?? []).flatMap((tag) => splitTerms(tag)),
  ]);
}

function countOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}

function scoreBuyingIntent(
  questionnaire: PersonalQuestionnaire | undefined,
  artwork: Artwork,
): { score: number; reasons: string[] } {
  const interest = normalizeTerm(questionnaire?.mostInterestedInBuying);
  if (!interest) {
    return { score: 0.5, reasons: [] };
  }

  const keywords = BUYING_INTEREST_KEYWORDS[interest] ?? [];
  if (keywords.length === 0) {
    return { score: 0.5, reasons: [] };
  }

  const terms = artworkTerms(artwork);
  const matched = keywords.filter((keyword) => terms.has(keyword));
  if (matched.length === 0) {
    return { score: 0.35, reasons: [] };
  }

  return {
    score: clamp01(0.65 + Math.min(0.3, matched.length * 0.1)),
    reasons: [`matches ${questionnaire?.mostInterestedInBuying} interest`],
  };
}

function scoreMetadata(
  profile: RecommendationBehaviorProfile,
  artwork: Artwork,
): { score: number; reasons: string[] } {
  let score = 0.5;
  const reasons: string[] = [];
  const artist = normalizeTerm(artwork.artist);

  if (artist && profile.likedArtists.has(artist)) {
    score += 0.3;
    reasons.push("artist previously liked");
  }
  if (artist && profile.dislikedArtists.has(artist)) {
    score -= 0.35;
    reasons.push("artist previously disliked");
  }

  const mediumTerms = new Set(splitTerms(artwork.medium));
  const likedMediumMatches = countOverlap(mediumTerms, profile.likedMediumTerms);
  const dislikedMediumMatches = countOverlap(
    mediumTerms,
    profile.dislikedMediumTerms,
  );
  if (likedMediumMatches > 0) {
    score += Math.min(0.2, likedMediumMatches * 0.08);
    reasons.push("medium similar to liked works");
  }
  if (dislikedMediumMatches > 0) {
    score -= Math.min(0.25, dislikedMediumMatches * 0.1);
    reasons.push("medium similar to disliked works");
  }

  const tags = new Set((artwork.tags ?? []).map(normalizeTerm).filter(Boolean));
  const likedTagMatches = countOverlap(tags, profile.likedTags);
  const dislikedTagMatches = countOverlap(tags, profile.dislikedTags);
  if (likedTagMatches > 0) {
    score += Math.min(0.2, likedTagMatches * 0.08);
    reasons.push("tags overlap liked works");
  }
  if (dislikedTagMatches > 0) {
    score -= Math.min(0.25, dislikedTagMatches * 0.1);
    reasons.push("tags overlap disliked works");
  }

  return { score: clamp01(score), reasons };
}

function scoreBehavior(
  artwork: Artwork,
  nowMs: number,
): { score: number; reasons: string[] } {
  let score = 0.5;
  const reasons: string[] = [];

  if (typeof artwork.createdAt === "number") {
    const ageMs = Math.max(0, nowMs - artwork.createdAt);
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays <= 14) {
      score += 0.2 * (1 - ageDays / 14);
      reasons.push("recently added");
    }
  }

  if (artwork.isAuction === true) {
    const endMs = artwork.endDate ? Date.parse(artwork.endDate) : Number.NaN;
    if (Number.isFinite(endMs) && endMs > nowMs) {
      score += 0.1;
      reasons.push("active auction");
    } else if (Number.isFinite(endMs) && endMs <= nowMs) {
      score -= 0.2;
      reasons.push("auction ended");
    }
  }

  return { score: clamp01(score), reasons };
}

export function buildRecommendationBehaviorProfile(
  preferences: Array<Pick<ArtworkPreference, "artworkId" | "liked">>,
  artworks: Artwork[],
): RecommendationBehaviorProfile {
  const artworkById = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const profile: RecommendationBehaviorProfile = {
    likedArtists: new Set(),
    dislikedArtists: new Set(),
    likedMediumTerms: new Set(),
    dislikedMediumTerms: new Set(),
    likedTags: new Set(),
    dislikedTags: new Set(),
  };

  for (const preference of preferences) {
    if (typeof preference.liked !== "boolean") {
      continue;
    }
    const artwork = artworkById.get(preference.artworkId);
    if (!artwork) {
      continue;
    }

    const artists = preference.liked
      ? profile.likedArtists
      : profile.dislikedArtists;
    const mediumTerms = preference.liked
      ? profile.likedMediumTerms
      : profile.dislikedMediumTerms;
    const tags = preference.liked ? profile.likedTags : profile.dislikedTags;

    const artist = normalizeTerm(artwork.artist);
    if (artist) {
      artists.add(artist);
    }
    splitTerms(artwork.medium).forEach((term) => mediumTerms.add(term));
    (artwork.tags ?? [])
      .map(normalizeTerm)
      .filter(Boolean)
      .forEach((tag) => tags.add(tag));
  }

  return profile;
}

export function scoreRecommendationCandidate(input: {
  artwork: Artwork;
  normalizedPreferenceVector: number[];
  normalizedLikedPreferenceVector?: number[];
  normalizedDislikedPreferenceVector?: number[];
  user: Pick<User, "personalQuestionnaire">;
  behaviorProfile: RecommendationBehaviorProfile;
  nowMs?: number;
  weights?: RecommendationScoreWeights;
}): RecommendationScoreBreakdown {
  const weights = input.weights ?? DEFAULT_RECOMMENDATION_SCORE_WEIGHTS;
  const baseImageSimilarity =
    vectorSimilarity01(input.normalizedPreferenceVector, input.artwork.vector) ??
    0;
  const likedImageSimilarity = hasVectorSignal(
    input.normalizedLikedPreferenceVector,
  )
    ? vectorSimilarity01(
        input.normalizedLikedPreferenceVector,
        input.artwork.vector,
      )
    : undefined;
  const dislikedImageSimilarity = hasVectorSignal(
    input.normalizedDislikedPreferenceVector,
  )
    ? vectorSimilarity01(
        input.normalizedDislikedPreferenceVector,
        input.artwork.vector,
      )
    : undefined;
  const imageSimilarity =
    likedImageSimilarity === undefined && dislikedImageSimilarity === undefined
      ? baseImageSimilarity
      : clamp01(
          baseImageSimilarity * 0.65 +
            (likedImageSimilarity ?? baseImageSimilarity) * 0.25 +
            (1 - (dislikedImageSimilarity ?? 0.5)) * 0.1,
        );
  const intent = scoreBuyingIntent(
    input.user.personalQuestionnaire,
    input.artwork,
  );
  const metadata = scoreMetadata(input.behaviorProfile, input.artwork);
  const behavior = scoreBehavior(input.artwork, input.nowMs ?? Date.now());
  const finalScore =
    imageSimilarity * weights.imageSimilarity +
    intent.score * weights.intentScore +
    metadata.score * weights.metadataScore +
    behavior.score * weights.behaviorScore;

  return {
    imageSimilarity,
    intentScore: intent.score,
    metadataScore: metadata.score,
    behaviorScore: behavior.score,
    finalScore: clamp01(finalScore),
    reasons: [...intent.reasons, ...metadata.reasons, ...behavior.reasons],
  };
}

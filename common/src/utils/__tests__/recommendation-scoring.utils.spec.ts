import { describe, expect, it } from "vitest";
import type { Artwork, ArtworkPreference } from "../../types/artwork.types";
import type { User } from "../../types/user.types";
import {
  buildRecommendationBehaviorProfile,
  scoreRecommendationCandidate,
} from "../recommendation-scoring.utils";

const buildArtwork = (overrides: Partial<Artwork>): Artwork => ({
  id: "artwork",
  domainId: "domain-1",
  type: "artwork",
  title: "Untitled",
  description: "",
  artist: "Artist",
  date: "2024",
  filename: "artwork.jpg",
  vector: [1, 0],
  vectorModel: "test-model",
  isPrivate: false,
  ...overrides,
});

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "user-1",
    domainId: "domain-1",
    email: "user@example.com",
    name: "User",
    role: "customer",
    status: "active",
    onboardingStatus: "completed",
    preferenceVector: [1, 0],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as User;

describe("recommendation-scoring.utils", () => {
  it("boosts artwork that matches questionnaire buying intent", () => {
    const user = buildUser({
      personalQuestionnaire: { mostInterestedInBuying: "Paintings" },
    });
    const profile = buildRecommendationBehaviorProfile([], []);
    const painting = buildArtwork({ medium: "Oil on canvas" });
    const photograph = buildArtwork({ medium: "Gelatin silver print" });

    const paintingScore = scoreRecommendationCandidate({
      artwork: painting,
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });
    const photographScore = scoreRecommendationCandidate({
      artwork: photograph,
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });

    expect(paintingScore.intentScore).toBeGreaterThan(
      photographScore.intentScore,
    );
    expect(paintingScore.finalScore).toBeGreaterThan(
      photographScore.finalScore,
    );
    expect(paintingScore.reasons).toContain("matches Paintings interest");
  });

  it("uses liked and disliked artwork metadata as ranking signals", () => {
    const liked = buildArtwork({
      id: "liked-art",
      artist: "Ada Artist",
      medium: "Bronze sculpture",
      tags: ["modern"],
    });
    const disliked = buildArtwork({
      id: "disliked-art",
      artist: "Bad Fit",
      medium: "Ink on paper",
      tags: ["works on paper"],
    });
    const preferences: Array<Pick<ArtworkPreference, "artworkId" | "liked">> = [
      { artworkId: liked.id, liked: true },
      { artworkId: disliked.id, liked: false },
    ];
    const profile = buildRecommendationBehaviorProfile(preferences, [
      liked,
      disliked,
    ]);
    const user = buildUser();

    const likedOverlap = scoreRecommendationCandidate({
      artwork: buildArtwork({
        artist: "Ada Artist",
        medium: "Polished bronze",
        tags: ["modern"],
      }),
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });
    const dislikedOverlap = scoreRecommendationCandidate({
      artwork: buildArtwork({
        artist: "Bad Fit",
        medium: "Ink on paper",
        tags: ["works on paper"],
      }),
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });

    expect(likedOverlap.metadataScore).toBeGreaterThan(
      dislikedOverlap.metadataScore,
    );
    expect(likedOverlap.reasons).toEqual(
      expect.arrayContaining([
        "artist previously liked",
        "medium similar to liked works",
        "tags overlap liked works",
      ]),
    );
    expect(dislikedOverlap.reasons).toEqual(
      expect.arrayContaining([
        "artist previously disliked",
        "medium similar to disliked works",
        "tags overlap disliked works",
      ]),
    );
  });

  it("keeps image similarity dominant over a small metadata advantage", () => {
    const user = buildUser({
      personalQuestionnaire: { mostInterestedInBuying: "Paintings" },
    });
    const liked = buildArtwork({
      id: "liked-art",
      artist: "Ada Artist",
      medium: "Oil on canvas",
      tags: ["painting"],
    });
    const profile = buildRecommendationBehaviorProfile(
      [{ artworkId: liked.id, liked: true }],
      [liked],
    );

    const strongImageMatch = scoreRecommendationCandidate({
      artwork: buildArtwork({
        vector: [1, 0],
        medium: "Gelatin silver print",
      }),
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });
    const weakImageMatchWithMetadata = scoreRecommendationCandidate({
      artwork: buildArtwork({
        artist: "Ada Artist",
        vector: [0, 1],
        medium: "Oil on canvas",
        tags: ["painting"],
      }),
      normalizedPreferenceVector: [1, 0],
      user,
      behaviorProfile: profile,
      nowMs: 1,
    });

    expect(strongImageMatch.finalScore).toBeGreaterThan(
      weakImageMatchWithMetadata.finalScore,
    );
  });

  it("handles missing metadata without throwing", () => {
    const score = scoreRecommendationCandidate({
      artwork: buildArtwork({
        artist: "",
        medium: undefined,
        tags: undefined,
        createdAt: undefined,
      }),
      normalizedPreferenceVector: [1, 0],
      user: buildUser(),
      behaviorProfile: buildRecommendationBehaviorProfile([], []),
      nowMs: 1,
    });

    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.reasons).toEqual([]);
  });

  it("handles invalid candidate vectors without throwing", () => {
    const score = scoreRecommendationCandidate({
      artwork: buildArtwork({ vector: [1] }),
      normalizedPreferenceVector: [1, 0],
      user: buildUser(),
      behaviorProfile: buildRecommendationBehaviorProfile([], []),
      nowMs: 1,
    });

    expect(score.imageSimilarity).toBe(0);
    expect(score.finalScore).toBeGreaterThan(0);
  });

  it("uses liked and disliked preference vectors to refine image similarity", () => {
    const likedMatch = scoreRecommendationCandidate({
      artwork: buildArtwork({ vector: [1, 0] }),
      normalizedPreferenceVector: [1, 0],
      normalizedLikedPreferenceVector: [1, 0],
      normalizedDislikedPreferenceVector: [0, 1],
      user: buildUser(),
      behaviorProfile: buildRecommendationBehaviorProfile([], []),
      nowMs: 1,
    });
    const dislikedMatch = scoreRecommendationCandidate({
      artwork: buildArtwork({ vector: [0, 1] }),
      normalizedPreferenceVector: [1, 0],
      normalizedLikedPreferenceVector: [1, 0],
      normalizedDislikedPreferenceVector: [0, 1],
      user: buildUser(),
      behaviorProfile: buildRecommendationBehaviorProfile([], []),
      nowMs: 1,
    });

    expect(likedMatch.imageSimilarity).toBeGreaterThan(
      dislikedMatch.imageSimilarity,
    );
    expect(likedMatch.finalScore).toBeGreaterThan(dislikedMatch.finalScore);
  });
});

import {
  calculateUpdatedPreferenceVector,
  cosineDistanceToSimilarity,
  cosineSimilarity,
  normalizeVector,
} from "../vector.utils";
import { describe, expect, it } from "vitest";

describe("vector.utils", () => {
  it("normalizes vectors to unit length", () => {
    const normalized = normalizeVector([3, 4]);

    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  it("returns a zero vector when the input magnitude is zero", () => {
    expect(normalizeVector([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("calculates cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("converts cosine distance to a bounded similarity score", () => {
    expect(cosineDistanceToSimilarity(0)).toBe(1);
    expect(cosineDistanceToSimilarity(0.25)).toBe(0.75);
    expect(cosineDistanceToSimilarity(5)).toBe(0);
  });

  it("updates preference vectors for likes", () => {
    const updated = calculateUpdatedPreferenceVector([1, 0], [0, 1], true, {
      learningRate: 1,
    });

    expect(updated[0]).toBeCloseTo(Math.SQRT1_2);
    expect(updated[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it("updates preference vectors for dislikes", () => {
    const updated = calculateUpdatedPreferenceVector([1, 0], [1, 0], false, {
      learningRate: 1,
      dislikeWeight: 1,
    });

    expect(updated).toEqual([1, 0]);
  });
});

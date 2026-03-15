/**
 * L2-normalizes the input vector.
 * Returns a zero vector when the input has no magnitude.
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    return new Array(vector.length).fill(0);
  }

  return vector.map((value) => value / magnitude);
}

/**
 * Calculates cosine similarity between two vectors.
 * Returns 0 when either vector has no magnitude.
 */
export function cosineSimilarity(
  left: number[],
  right: number[],
): number {
  if (left.length !== right.length) {
    throw new Error(
      `Vector length mismatch: ${left.length} !== ${right.length}`,
    );
  }

  if (left.length === 0) {
    return 0;
  }

  const normalizedLeft = normalizeVector(left);
  const normalizedRight = normalizeVector(right);

  return normalizedLeft.reduce(
    (sum, value, index) => sum + value * normalizedRight[index],
    0,
  );
}

/**
 * Converts Cosmos DB cosine distance to a stable 0..1 similarity score.
 */
export function cosineDistanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) {
    return 0;
  }

  return Math.min(1, Math.max(0, 1 - distance));
}

/**
 * Updates a preference vector after a like/dislike interaction.
 */
export function calculateUpdatedPreferenceVector(
  userVector: number[],
  imageVector: number[],
  liked: boolean,
  options?: {
    learningRate?: number;
    dislikeWeight?: number;
  },
): number[] {
  if (userVector.length !== imageVector.length) {
    throw new Error(
      `Vector length mismatch: ${userVector.length} !== ${imageVector.length}`,
    );
  }

  const learningRate = options?.learningRate ?? 0.2;
  const dislikeWeight = options?.dislikeWeight ?? 0.6;
  const direction = liked ? 1 : -dislikeWeight;
  const nextVector = userVector.map(
    (value, index) => value + imageVector[index] * learningRate * direction,
  );

  const normalized = normalizeVector(nextVector);
  const hasSignal = normalized.some((value) => value !== 0);

  if (hasSignal) {
    return normalized;
  }

  return liked ? normalizeVector(imageVector) : normalizeVector(userVector);
}

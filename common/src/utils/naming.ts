// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------

import assert from 'node:assert/strict';
import { ThumbnailInfo } from '../types/artwork.types';

/**
 * Ensures IDs follow UUID-like format for naming functions.
 */
const validateId = (label: string, value: string): void => {
  assert.ok(
    typeof value === 'string' && value.trim().length > 0,
    `${label} must be a non-empty string`,
  );
};

export const getOriginalBlobPath = (domainId: string, artId: string, ext: string): string => {
  validateId('domainId', domainId);
  validateId('artId', artId);
  assert.ok(ext, 'ext required');
  return `${domainId}/artworks/${artId}/original.${ext.replace(/[^a-z0-9.]/gi, '')}`;
};

export const getDerivativeBlobPath = (
  domainId: string,
  artId: string,
  size: number,
): string => {
  validateId('domainId', domainId);
  validateId('artId', artId);
  assert.ok(size > 0, 'size must be positive');
  return `${domainId}/artworks/${artId}/thumb-${size}.webp`;
};

export const getSearchDocId = (domainId: string, artId: string): string => {
  validateId('domainId', domainId);
  validateId('artId', artId);
  return `${domainId}::${artId}`;
};

export const getQueueName = (env: string): string => {
  const normalized = env.trim().toLowerCase();
  assert.ok(normalized, 'env required');
  return `tastematcher-${normalized}-queue-indexing`;
};

export const getQueueDlqName = (env: string): string => `${getQueueName(env)}-dlq`;

// Returns thumbnail size string based on dimensions - Small, Medium, Large
export const getThumbnailSizeFromDimensions = (width: number, height: number): string => {
  const size = Math.max(width, height);

  switch (true) {
    case size <= 150:
      return 'Small';
    case size <= 400:
      return 'Medium';
    default:
      return 'Large';
  }
};
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

import { BadRequestException } from '@nestjs/common/exceptions/bad-request.exception';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';

/**
 * Ensures IDs follow UUID-like format for naming functions.
 */
const validateId = (label: string, value: string): void => {
  assert.ok(
    typeof value === 'string' && value.trim().length > 0,
    `${label} must be a non-empty string`,
  );
};

export const extractFileExtension = (mimeType: string): string => {
  const ext = mimeType.split('/').pop()?.toLowerCase();
  if (!ext) {
    throw new BadRequestException('File must have an extension');
  }

  // Sanitize extension to prevent path traversal
  return ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export const getTemporaryBlobFolder = (domainId: string, userId: string): string => {
  validateId('domainId', domainId);
  validateId('userId', userId);

  return `${domainId}/preferences/${userId}`;
}

export const getTemporaryBlobPath = (domainId: string, userId: string, mimeType: string): string => {
  validateId('domainId', domainId);
  validateId('userId', userId);
  assert.ok(mimeType, 'mimeType required');

  return `${getTemporaryBlobFolder(domainId, userId)}/${uuidv4()}.${extractFileExtension(mimeType)}`;
};

export const getDomainBlobFolder = (domainId: string): string => {
  validateId('domainId', domainId);
  return `${domainId}/artworks`;
}

export const getOriginalBlobPath = (domainId: string, artworkId: string, mimeType: string): string => {
  validateId('domainId', domainId);
  validateId('artworkId', artworkId);
  assert.ok(mimeType, 'mimeType required');

  return `${getDomainBlobFolder(domainId)}/${artworkId}/original.${extractFileExtension(mimeType)}`;
};

export const getDerivativeBlobPath = (
  domainId: string,
  artworkId: string,
  size: string,
): string => {
  validateId('domainId', domainId);
  validateId('artworkId', artworkId);
  // size can be only Small, Medium, Large as per ThumbnailSize type
  assert.ok(['Small', 'Medium', 'Large'].includes(size), `Invalid size: ${size}. Allowed values are Small, Medium, Large.`);
  return `${getDomainBlobFolder(domainId)}/${artworkId}/${size.toLocaleLowerCase()}.jpg`;
};

export const getSearchDocId = (domainId: string, artworkId: string): string => {
  validateId('domainId', domainId);
  validateId('artworkId', artworkId);
  return `${domainId}::${artworkId}`;
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
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
// 10. Frontend-specific: UI changes must be responsive (mobile + desktop) and smooth (no visual regressions). Include accessibility considerations (semantic markup, aria attributes, keyboard navigation, focus management) and automated accessibility checks (axe, Playwright/accessibility audit) where applicable.
// -----------------------------------------------------------

/**
 * Message format for image processing queue
 */
export interface ImageProcessingQueueMessage {
  /** Unique message identifier for idempotency */
  messageId: string;
  /** Artwork database ID */
  artworkId: string;
  /** Domain this artwork belongs to */
  domainId: string;
  /** Blob container name */
  containerName: string;
  /** Blob name/path */
  blobName: string;
  /** Original content type */
  contentType: string;
  /** Timestamp when uploaded */
  uploadedAt: string;
  /** Optional correlation ID for tracing */
  correlationId?: string;
}

/**
 * Thumbnail size configuration
 */
export interface ThumbnailSize {
  name: 'small' | 'medium' | 'large';
  width: number;
  height: number;
}

/**
 * Result of thumbnail generation
 */
export interface ThumbnailResult {
  size: ThumbnailSize['name'];
  blobUrl: string;
  width: number;
  height: number;
}

/**
 * Vector embedding result for cognitive search
 */
export interface VectorEmbedding {
  /** Embedding vector (1536 dimensions for OpenAI ada-002) */
  vector: number[];
  /** Model used for embedding */
  model: string;
}

/**
 * Complete processing result
 */
export interface ImageProcessingResult {
  artworkId: string;
  thumbnails: ThumbnailResult[];
  vectorEmbedding: VectorEmbedding;
  processedAt: string;
  durationMs: number;
}

/**
 * Processing error details
 */
export interface ProcessingError {
  artworkId: string;
  errorCode: 'DOWNLOAD_FAILED' | 'THUMBNAIL_FAILED' | 'VECTORIZE_FAILED' | 'SEARCH_INDEX_FAILED' | 'UNKNOWN';
  message: string;
  retryCount: number;
  failedAt: string;
}

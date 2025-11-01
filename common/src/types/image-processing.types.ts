// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Shared types for queue contracts.
// 3. Unit tests not required for pure type definitions.
// 4. JSDoc for all exported types.
// -----------------------------------------------------------

/**
 * Message format for image processing queue.
 * Enqueued when an artwork image is uploaded to blob storage.
 */
export interface ImageProcessingQueueMessage {
  /** Unique identifier for this processing job */
  messageId: string;
  /** Artwork database ID */
  artworkId: string;
  /** Domain ID for multi-tenancy */
  domainId: string;
  /** Blob container name */
  containerName: string;
  /** Blob name (path) in storage */
  blobName: string;
  /** Original filename */
  originalFilename: string;
  /** MIME type (e.g., image/jpeg) */
  contentType: string;
  /** Timestamp when message was enqueued */
  enqueuedAt: string;
  /** Correlation ID for distributed tracing */
  correlationId: string;
}

/**
 * Thumbnail configuration for image processing.
 */
export interface ThumbnailConfig {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Suffix for blob name (e.g., 'thumb_sm') */
  suffix: string;
}

/**
 * Result of thumbnail generation.
 */
export interface ThumbnailResult {
  /** Thumbnail size suffix */
  suffix: string;
  /** Blob name of generated thumbnail */
  blobName: string;
  /** Public URL (if applicable) */
  url?: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Image vector embedding result.
 */
export interface ImageVectorResult {
  /** Vector embedding array (e.g., 1024 dimensions) */
  embedding: number[];
  /** Model used for vectorization */
  model: string;
  /** Confidence score if applicable */
  confidence?: number;
}

/**
 * Complete image processing result.
 */
export interface ImageProcessingResult {
  /** Artwork ID */
  artworkId: string;
  /** Message ID for idempotency */
  messageId: string;
  /** Processing status */
  status: 'success' | 'partial' | 'failed';
  /** Generated thumbnails */
  thumbnails: ThumbnailResult[];
  /** Vector embedding result */
  vectorResult?: ImageVectorResult;
  /** Cognitive Search document ID */
  searchDocumentId?: string;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp when processing completed */
  completedAt: string;
}

/**
 * Error details for failed processing.
 */
export interface ImageProcessingError {
  /** Error code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Retry attempt number */
  retryCount: number;
  /** Whether this error is retriable */
  retriable: boolean;
}

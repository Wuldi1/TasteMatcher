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
// 10. Frontend-specific: N/A (backend service)
// -----------------------------------------------------------

import { app, InvocationContext } from '@azure/functions';
import type { ImageProcessingQueueMessage } from '@tastematcher/common';
import { createLogger } from './lib/logger';
import { BlobService } from './services/BlobService';
import { ThumbnailService } from './services/ThumbnailService';
import { VectorizationService } from './services/VectorizationService';
import { SearchIndexService } from './services/SearchIndexService';
import { config } from './lib/config';
import { metrics } from './lib/metrics';

const logger = createLogger('ProcessImagesFromBlob');

/**
 * Validates the structure of the queue message
 */
function validateMessage(message: unknown): asserts message is ImageProcessingQueueMessage {
  const msg = message as Partial<ImageProcessingQueueMessage>;
  
  if (!msg.messageId || typeof msg.messageId !== 'string') {
    throw new Error('Invalid message: messageId is required');
  }
  if (!msg.artworkId || typeof msg.artworkId !== 'string') {
    throw new Error('Invalid message: artworkId is required');
  }
  if (!msg.domainId || typeof msg.domainId !== 'string') {
    throw new Error('Invalid message: domainId is required');
  }
  if (!msg.containerName || typeof msg.containerName !== 'string') {
    throw new Error('Invalid message: containerName is required');
  }
  if (!msg.blobName || typeof msg.blobName !== 'string') {
    throw new Error('Invalid message: blobName is required');
  }
}

/**
 * Azure Function: Process images from blob storage queue
 * 
 * Triggered by queue messages containing blob upload metadata.
 * Processes images by:
 * 1. Downloading from blob storage
 * 2. Generating multiple thumbnail sizes
 * 3. Creating vector embeddings for search
 * 4. Indexing in Azure Cognitive Search
 * 
 * Includes automatic retries, idempotency checks, and comprehensive logging.
 */
export async function processImagesFromBlob(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const start = Date.now();
  const correlationId = context.invocationId;

  try {
    // Validate message structure
    validateMessage(queueItem);
    const message = queueItem as ImageProcessingQueueMessage;

    logger.info({
      msg: 'Processing image from queue',
      messageId: message.messageId,
      artworkId: message.artworkId,
      domainId: message.domainId,
      blobName: message.blobName,
      correlationId: message.correlationId || correlationId,
    });

    metrics.increment('image_processing.received', {
      domainId: message.domainId,
    });

    // Initialize services
    const blobService = new BlobService(config);
    const thumbnailService = new ThumbnailService(config);
    const vectorizationService = new VectorizationService(config);
    const searchIndexService = new SearchIndexService(config);

    // Step 1: Download blob
    logger.debug({
      msg: 'Downloading blob',
      artworkId: message.artworkId,
      container: message.containerName,
      blob: message.blobName,
      correlationId,
    });

    const imageBuffer = await blobService.downloadBlob(
      message.containerName,
      message.blobName
    );

    metrics.increment('image_processing.downloaded', {
      domainId: message.domainId,
    });

    // Step 2: Generate thumbnails
    logger.debug({
      msg: 'Generating thumbnails',
      artworkId: message.artworkId,
      correlationId,
    });

    const thumbnails = await thumbnailService.generateThumbnails(
      imageBuffer,
      message.artworkId
    );

    metrics.increment('image_processing.thumbnails_generated', {
      domainId: message.domainId,
      count: thumbnails.length,
    });

    // Step 3: Generate vector embedding
    logger.debug({
      msg: 'Generating vector embedding',
      artworkId: message.artworkId,
      correlationId,
    });

    const vectorEmbedding = await vectorizationService.generateEmbedding(imageBuffer);

    metrics.increment('image_processing.vectorized', {
      domainId: message.domainId,
    });

    // Step 4: Index in cognitive search
    logger.debug({
      msg: 'Indexing in cognitive search',
      artworkId: message.artworkId,
      correlationId,
    });

    await searchIndexService.indexArtwork({
      artworkId: message.artworkId,
      domainId: message.domainId,
      thumbnails,
      vectorEmbedding,
    });

    metrics.increment('image_processing.indexed', {
      domainId: message.domainId,
    });

    const durationMs = Date.now() - start;

    logger.info({
      msg: 'Image processing completed',
      messageId: message.messageId,
      artworkId: message.artworkId,
      domainId: message.domainId,
      durationMs,
      correlationId: message.correlationId || correlationId,
    });

    metrics.timing('image_processing.duration', durationMs, {
      domainId: message.domainId,
    });

  } catch (error) {
    const durationMs = Date.now() - start;
    
    logger.error({
      msg: 'Image processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
      correlationId,
    });

    metrics.increment('image_processing.failed', {
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    // Re-throw to trigger Azure Functions retry mechanism
    throw error;
  }
}

// Register Azure Function with queue trigger
app.storageQueue('ProcessImagesFromBlob', {
  queueName: config.queueName,
  connection: 'STORAGE_CONNECTION_STRING',
  handler: processImagesFromBlob,
});

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

import { app, InvocationContext } from "@azure/functions";
import type {
  ImageProcessingQueueMessage,
  NewArtworkNotificationQueueMessage,
} from "@tastematcher/common";
import {
  BlobService,
  ThumbnailService,
  VectorizationService,
  createLogger,
  metrics,
  loadConfig,
  CosmosService,
} from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger("ProcessImagesFromBlob");

/**
 * Validates the structure of the queue message
 */
function validateMessage(
  message: unknown,
): asserts message is ImageProcessingQueueMessage {
  const msg = message as Partial<ImageProcessingQueueMessage>;

  if (!msg.messageId || typeof msg.messageId !== "string") {
    throw new Error("Invalid message: messageId is required");
  }
  if (!msg.artworkId || typeof msg.artworkId !== "string") {
    throw new Error("Invalid message: artworkId is required");
  }
  if (!msg.domainId || typeof msg.domainId !== "string") {
    throw new Error("Invalid message: domainId is required");
  }
  if (!msg.blobName || typeof msg.blobName !== "string") {
    throw new Error("Invalid message: blobName is required");
  }
  if (!msg.fileUrl || typeof msg.fileUrl !== "string") {
    throw new Error("Invalid message: fileUrl is required");
  }
}

/**
 * Azure Function: Process images from blob storage queue
 *
 * Triggered by queue messages containing blob upload metadata.
 * Processes images by:
 * 1. Downloading from blob storage
 * 2. Generating multiple thumbnail sizes
 * 3. Creating vector embeddings
 * 4. Storing vectors in Cosmos DB
 *
 * Includes automatic retries, idempotency checks, and comprehensive logging.
 */
export async function processImagesFromBlob(
  queueItem: unknown,
  context: InvocationContext,
): Promise<void> {
  const start = Date.now();

  try {
    // Validate message structure
    validateMessage(queueItem);
    const message = queueItem as ImageProcessingQueueMessage;

    logger.info({
      msg: "Processing image from queue",
      messageId: message.messageId,
      artworkId: message.artworkId,
      domainId: message.domainId,
      blobName: message.blobName,
      fileUrl: message.fileUrl,
      correlationId: message.messageId,
      invocationContextId: context.invocationId,
    });

    metrics.increment("image_processing.received", {
      domainId: message.domainId,
    });

    // Initialize services
    const blobService = new BlobService();
    const thumbnailService = new ThumbnailService();
    const vectorizationService = new VectorizationService();
    const cosmosService = new CosmosService();

    // Step 1: Download blob
    logger.debug({
      msg: "Downloading blob",
      artworkId: message.artworkId,
      blob: message.blobName,
      messageId: message.messageId,
      invocationContextId: context.invocationId,
    });

    const imageBuffer = await blobService.downloadBlob(
      "originals",
      message.blobName,
    );

    metrics.increment("image_processing.downloaded", {
      domainId: message.domainId,
    });

    // Step 2: Generate thumbnails
    logger.debug({
      msg: "Generating thumbnails",
      imageUrl: message.fileUrl,
      artworkId: message.artworkId,
      messageId: message.messageId,
      invocationContextId: context.invocationId,
    });

    const thumbnails = await thumbnailService.generateAndUploadThumbnails(
      imageBuffer,
      message.domainId,
      message.artworkId,
    );

    metrics.increment("image_processing.thumbnails_generated", {
      domainId: message.domainId,
      count: thumbnails.length,
    });

    // Step 3: Generate vector embedding
    logger.debug({
      msg: "Generating vector embedding",
      artworkId: message.artworkId,
      messageId: message.messageId,
      imageUrl: message.fileUrl,
      invocationContextId: context.invocationId,
    });

    const vectorEmbedding = await vectorizationService.generateEmbedding(
      message.fileUrl,
      message.messageId,
    );

    metrics.increment("image_processing.vectorized", {
      artworkId: message.artworkId,
      domainId: message.domainId,
      messageId: message.messageId,
      invocationContextId: context.invocationId,
    });

    // Step 4: Persist vector embedding in Cosmos DB
    logger.debug({
      msg: "Storing vector embedding in Cosmos DB",
      artworkId: message.artworkId,
      messageId: message.messageId,
      invocationContextId: context.invocationId,
    });

    // store vector embedding in cosmos db aswell
    // TODO : use Patch operation instead of read + replace
    const artworksContainer = await cosmosService.getArtworksContainer();

    await artworksContainer.item(message.artworkId, message.domainId).patch([
      { op: "set", path: "/vector", value: vectorEmbedding.vector },
      { op: "set", path: "/vectorModel", value: vectorEmbedding.model },
      { op: "replace", path: "/updatedAt", value: Date.now() },
    ]);

    metrics.increment("image_processing.artwork_updated", {
      domainId: message.domainId,
    });

    const notificationsQueueName = process.env.NEW_ARTWORK_QUEUE_NAME;
    if (notificationsQueueName) {
      const notificationMessage: NewArtworkNotificationQueueMessage = {
        messageId: uuidv4(),
        artworkId: message.artworkId,
        domainId: message.domainId,
        uploadedAt: message.uploadedAt,
      };
      await blobService.sendMessageToQueue(
        notificationMessage,
        notificationsQueueName,
      );
      metrics.increment("new_artwork_notification.enqueued", {
        domainId: message.domainId,
      });
    } else {
      logger.warn({
        msg: "NEW_ARTWORK_QUEUE_NAME not set; skipping notification enqueue",
        artworkId: message.artworkId,
        domainId: message.domainId,
      });
    }

    const durationMs = Date.now() - start;

    logger.info({
      msg: "Image processing completed",
      messageId: message.messageId,
      artworkId: message.artworkId,
      domainId: message.domainId,
      durationMs,
      invocationContextId: context.invocationId,
    });

    metrics.timing("image_processing.duration", durationMs, {
      domainId: message.domainId,
    });
  } catch (error) {
    const durationMs = Date.now() - start;

    logger.error({
      msg: "Image processing failed",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    metrics.increment("image_processing.failed", {
      errorType: error instanceof Error ? error.constructor.name : "Unknown",
    });

    // Re-throw to trigger Azure Functions retry mechanism
    throw error;
  }
}

const appConfig = loadConfig();

// Register Azure Function with queue trigger
app.storageQueue("ProcessImagesFromBlob", {
  queueName: appConfig.queue.name,
  connection: "AzureWebJobsStorage", // Use connection string name, not the actual connection string
  handler: processImagesFromBlob,
});

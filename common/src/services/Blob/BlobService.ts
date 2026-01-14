import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import {
  QueueServiceClient,
  StorageSharedKeyCredential as QueueCredential,
} from "@azure/storage-queue";
import { createLogger } from "../../lib/logger";
import { loadConfig, type AppConfig } from "../../lib/config";
import { retryWithBackoff } from "../../utils/retry";
import { ImageProcessingQueueMessage } from "../../types/queue.types";
import { BadRequestException } from "@nestjs/common";

const logger = createLogger("BlobService");

/**
 * Service for Azure Blob Storage operations with retry logic
 */
export class BlobService {
  private blobStorageClient: BlobServiceClient;
  private queueServiceClient: QueueServiceClient;
  private appConfig: AppConfig;

  // File validation constants
  private static readonly ALLOWED_IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  private static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  constructor() {
    this.appConfig = loadConfig();

    this.blobStorageClient = BlobServiceClient.fromConnectionString(
      this.appConfig.azure.storageConnectionString,
    );

    // Initialize Azure SDK clients
    const queueCredential = new QueueCredential(
      this.appConfig.storage.account,
      this.appConfig.storage.accountKey,
    );
    this.queueServiceClient = new QueueServiceClient(
      `https://${this.appConfig.storage.account}.queue.core.windows.net`,
      queueCredential,
    );

    this.queueServiceClient = QueueServiceClient.fromConnectionString(
      this.appConfig.azure.storageConnectionString,
    );
  }

  /**
   * Validate image file type
   * @throws Error if file type is not allowed
   */
  public validateImageMimeType(mimetype: string): void {
    if (
      !BlobService.ALLOWED_IMAGE_MIME_TYPES.includes(mimetype.toLowerCase())
    ) {
      throw new BadRequestException(
        `Invalid file type: ${mimetype}. Only JPEG and PNG images are allowed.`,
      );
    }
  }

  /**
   * Validate file size
   * @throws Error if file exceeds maximum size
   */
  public validateFileSize(sizeBytes: number, maxSizeBytes?: number): void {
    const maxSize = maxSizeBytes || BlobService.MAX_FILE_SIZE_BYTES;
    if (sizeBytes > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      const actualSizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `File size (${actualSizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB.`,
      );
    }
  }

  /**
   * Validate image file (combines mime type and size validation)
   * @throws Error if validation fails
   */
  public validateImageFile(file: Express.Multer.File): void {
    this.validateImageMimeType(file.mimetype);
    this.validateFileSize(file.size);
  }

  // will be used mostly for health purposes
  async getBlobContainerClient(
    containerName: string,
  ): Promise<ContainerClient> {
    return this.blobStorageClient.getContainerClient(containerName);
  }

  /**
   * Downloads a blob as a Buffer with exponential backoff retry
   */
  async downloadBlob(containerName: string, blobName: string): Promise<Buffer> {
    return await retryWithBackoff<Buffer>(
      async () => {
        logger.debug({
          msg: "Downloading blob",
          container: containerName,
          blob: blobName,
        });

        const containerClient =
          this.blobStorageClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const downloadResponse = await blobClient.download();

        if (!downloadResponse.readableStreamBody) {
          throw new Error("No readable stream in download response");
        }

        const chunks: Buffer[] = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(Buffer.from(chunk));
        }

        const buffer = Buffer.concat(chunks);

        logger.debug({
          msg: "Blob downloaded successfully",
          container: containerName,
          blob: blobName,
          sizeBytes: buffer.length,
        });

        return buffer;
      },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      `downloadBlob-${containerName}-${blobName}`,
      logger,
    ).catch((err: Error) => {
      logger.error({
        msg: "Failed to download blob after retries",
        container: containerName,
        blob: blobName,
        err,
      });
      throw err;
    });
  }

  /**
   * Uploads a buffer to blob storage
   */
  async uploadBlob(
    containerName: string,
    blobName: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const containerClient =
      this.blobStorageClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    return retryWithBackoff<string>(
      async () => {
        logger.debug({
          msg: "Uploading blob",
          container: containerName,
          blob: blobName,
          sizeBytes: fileBuffer.length,
        });

        await blobClient.uploadData(fileBuffer, {
          blobHTTPHeaders: {
            blobContentType: contentType,
            blobCacheControl: "public, max-age=31536000", // 1 year cache
          },
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalSize: fileBuffer.length.toString(),
          },
          onProgress: (progress: { loadedBytes?: number }) => {
            if (
              progress.loadedBytes &&
              progress.loadedBytes % (1024 * 1024) === 0
            ) {
              logger.debug({
                msg: "Upload progress",
                container: containerName,
                blob: blobName,
                loadedBytes: progress.loadedBytes,
              });
            }
          },
        });

        logger.debug({
          action: "uploadToBlob.success",
          blobName,
          fileUrl: blobClient.url,
        });

        return this.appendCacheBustingParam(blobClient.url);
      },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      `uploadBlob-${containerName}-${blobName}`,
      logger,
    ).catch((err: Error) => {
      logger.error({
        msg: "Failed to upload blob after retries",
        container: containerName,
        blob: blobName,
        err,
      });
      throw err;
    });
  }

  /**
   * Delete blob if it exists
   */
  async deleteBlobIfExists(container: string, blobName: string): Promise<void> {
    const containerClient =
      this.blobStorageClient.getContainerClient(container);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
    logger.debug({
      msg: "Deleted blob if exists",
      container,
      blobName,
    });
  }

  /**
   * Delete all blobs with a given prefix (folder)
   * Useful for cleaning up temporary files in a specific folder
   * @param containerName - The container name
   * @param prefix - The blob prefix (folder path) to delete, e.g., "temp/preferences/userId123/"
   */
  async deleteBlobsWithPrefix(
    containerName: string,
    prefix: string,
  ): Promise<void> {
    return retryWithBackoff<void>(
      async () => {
        logger.debug({
          msg: "Deleting blobs with prefix",
          container: containerName,
          prefix,
        });

        const containerClient =
          this.blobStorageClient.getContainerClient(containerName);

        // List all blobs with the given prefix
        const blobsToDelete: string[] = [];
        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
          blobsToDelete.push(blob.name);
        }

        if (blobsToDelete.length === 0) {
          logger.debug({
            msg: "No blobs found with prefix",
            container: containerName,
            prefix,
          });
          return;
        }

        logger.debug({
          msg: "Found blobs to delete",
          container: containerName,
          prefix,
          count: blobsToDelete.length,
        });

        // Delete blobs in parallel (with reasonable batch size)
        const BATCH_SIZE = 10;
        for (let i = 0; i < blobsToDelete.length; i += BATCH_SIZE) {
          const batch = blobsToDelete.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (blobName) => {
              try {
                const blobClient = containerClient.getBlockBlobClient(blobName);
                await blobClient.deleteIfExists();
                logger.debug({
                  msg: "Deleted blob",
                  container: containerName,
                  blobName,
                });
              } catch (err) {
                logger.error({
                  msg: "Failed to delete blob",
                  container: containerName,
                  blobName,
                  err,
                });
                // Continue with other blobs even if one fails
              }
            }),
          );
        }

        logger.debug({
          msg: "Successfully deleted blobs with prefix",
          container: containerName,
          prefix,
          deletedCount: blobsToDelete.length,
        });
      },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      `deleteBlobsWithPrefix-${containerName}-${prefix}`,
      logger,
    ).catch((err: Error) => {
      logger.error({
        msg: "Failed to delete blobs with prefix after retries",
        container: containerName,
        prefix,
        err,
      });
      throw err;
    });
  }

  async sendMessageToQueue(
    message: ImageProcessingQueueMessage,
  ): Promise<void> {
    const queueClient = this.queueServiceClient.getQueueClient(
      this.appConfig.queue.name,
    );
    await queueClient.createIfNotExists();

    const messageText = Buffer.from(JSON.stringify(message)).toString("base64");
    await queueClient.sendMessage(messageText);

    logger.debug({
      msg: "Sent message to queue",
      queueName: this.appConfig.queue.name,
    });
  }

  private appendCacheBustingParam(url: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
  }
}

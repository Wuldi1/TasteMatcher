import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { QueueServiceClient, StorageSharedKeyCredential as QueueCredential } from '@azure/storage-queue';
import { createLogger } from '../../lib/logger';
import { loadConfig, type AppConfig } from '../../lib/config';
import { retryWithBackoff } from '../../utils/retry';
import { ImageProcessingQueueMessage } from '../../types/queue.types';

const logger = createLogger('BlobService');

/**
 * Service for Azure Blob Storage operations with retry logic
 */
export class BlobService {
  private blobStorageClient: BlobServiceClient;
  private queueServiceClient: QueueServiceClient;

  private appConfig: AppConfig;

  constructor() {
    this.appConfig = loadConfig();

    this.blobStorageClient = BlobServiceClient.fromConnectionString(
      this.appConfig.azure.storageConnectionString
    );

    // Initialize Azure SDK clients
    const queueCredential = new QueueCredential(this.appConfig.storage.account, this.appConfig.storage.accountKey);
    this.queueServiceClient = new QueueServiceClient(
      `https://${this.appConfig.storage.account}.queue.core.windows.net`,
      queueCredential
    );

    this.queueServiceClient = QueueServiceClient.fromConnectionString(
      this.appConfig.azure.storageConnectionString
    );
  }

  // will be used mostly for health purposes
  async getBlobContainerClient(containerName: string): Promise<ContainerClient> {
    return this.blobStorageClient.getContainerClient(containerName);
  }

  /**
   * Downloads a blob as a Buffer with exponential backoff retry
   */
  async downloadBlob(containerName: string, blobName: string): Promise<Buffer> {
    return await retryWithBackoff<Buffer>
      (async () => {
        logger.debug({
          msg: 'Downloading blob',
          container: containerName,
          blob: blobName,
        });

        const containerClient = this.blobStorageClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const downloadResponse = await blobClient.download();

        if (!downloadResponse.readableStreamBody) {
          throw new Error('No readable stream in download response');
        }

        const chunks: Buffer[] = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(Buffer.from(chunk));
        }

        const buffer = Buffer.concat(chunks);

        logger.debug({
          msg: 'Blob downloaded successfully',
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
        logger)
      .catch((err: Error) => {
        logger.error({
          msg: 'Failed to download blob after retries',
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
    contentType: string
  ): Promise<string> {
    const containerClient = this.blobStorageClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    return retryWithBackoff<string>(
      async () => {
        logger.debug({
          msg: 'Uploading blob',
          container: containerName,
          blob: blobName,
          sizeBytes: fileBuffer.length,
        });

        await blobClient.uploadData(fileBuffer, {
          blobHTTPHeaders: {
            blobContentType: contentType,
            blobCacheControl: 'public, max-age=31536000', // 1 year cache
          },
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalSize: fileBuffer.length.toString(),
          },
          onProgress: (progress: { loadedBytes?: number }) => {
            if (progress.loadedBytes && progress.loadedBytes % (1024 * 1024) === 0) {
              logger.debug({
                msg: 'Upload progress',
                container: containerName,
                blob: blobName,
                loadedBytes: progress.loadedBytes,
              });
            }
          },
        });

        logger.debug({
          action: 'uploadToBlob.success',
          blobName,
          fileUrl: blobClient.url
        });

        return blobClient.url;
      },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      `uploadBlob-${containerName}-${blobName}`,
      logger
    ).catch((err: Error) => {
      logger.error({
        msg: 'Failed to upload blob after retries',
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
    const containerClient = this.blobStorageClient.getContainerClient(container);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
    logger.debug({
      msg: 'Deleted blob if exists',
      container,
      blobName,
    });
  }

  async sendMessageToQueue(message: ImageProcessingQueueMessage): Promise<void> {
    const queueClient = this.queueServiceClient.getQueueClient(this.appConfig.queue.name);
    await queueClient.createIfNotExists();

    const messageText = Buffer.from(JSON.stringify(message)).toString('base64');
    await queueClient.sendMessage(messageText);

    logger.debug({
      msg: 'Sent message to queue',
      queueName: this.appConfig.queue.name,
    });
  }
}
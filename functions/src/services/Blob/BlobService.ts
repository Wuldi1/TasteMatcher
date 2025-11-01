import { BlobServiceClient } from '@azure/storage-blob';
import { createLogger } from '../../lib/logger';
import type { Config } from '../../lib/config';
import { retryWithBackoff } from '../../utils/retry';

const logger = createLogger('BlobService');

/**
 * Service for Azure Blob Storage operations with retry logic
 */
export class BlobService {
  private client: BlobServiceClient;

  constructor(config: Config) {
    this.client = BlobServiceClient.fromConnectionString(
      config.azure.storageConnectionString
    );
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

        const containerClient = this.client.getContainerClient(containerName);
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
          maxAttempts: 5,
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
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const containerClient = this.client.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    return retryWithBackoff<string>(
      async () => {
        logger.debug({
          msg: 'Uploading blob',
          container: containerName,
          blob: blobName,
          sizeBytes: buffer.length,
        });

        await blobClient.upload(buffer, buffer.length, {
          blobHTTPHeaders: { blobContentType: contentType },
        });

        return blobClient.url;
      },
      {
        maxAttempts: 5,
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
}

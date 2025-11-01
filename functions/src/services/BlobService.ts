import { BlobServiceClient } from '@azure/storage-blob';
import { createLogger } from '../lib/logger';
import type { Config } from '../lib/config';

const logger = createLogger('BlobService');

/**
 * Service for Azure Blob Storage operations with retry logic
 */
export class BlobService {
  private client: BlobServiceClient;

  constructor(config: Config) {
    this.client = BlobServiceClient.fromConnectionString(
      config.storageConnectionString
    );
  }

  /**
   * Downloads a blob as a Buffer with exponential backoff retry
   */
  async downloadBlob(containerName: string, blobName: string): Promise<Buffer> {
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({
          msg: 'Downloading blob',
          container: containerName,
          blob: blobName,
          attempt: attempt + 1,
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

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        logger.warn({
          msg: 'Blob download failed',
          container: containerName,
          blob: blobName,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : 'Unknown',
          willRetry: !isLastAttempt,
        });

        if (isLastAttempt) {
          throw new Error(
            `Failed to download blob after ${maxRetries + 1} attempts: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Unexpected: retry loop completed without return or throw');
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

    await blobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    logger.debug({
      msg: 'Blob uploaded',
      container: containerName,
      blob: blobName,
      sizeBytes: buffer.length,
    });

    return blobClient.url;
  }
}

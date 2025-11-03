// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobStorageClient } from '@tastematcher/common';
import { ContainerClient } from '@azure/storage-blob';

/**
 * NestJS service that wraps BlobStorageClient with proper configuration injection
 */
@Injectable()
export class BlobService {
  private readonly logger = new Logger(BlobService.name);
  private readonly client: BlobStorageClient;

  constructor(private readonly configService: ConfigService) {
    const account = this.configService.get<string>('AZURE_STORAGE_ACCOUNT');
    const accountKey = this.configService.get<string>('AZURE_STORAGE_ACCOUNT_KEY');

    if (!account) {
      throw new Error('AZURE_STORAGE_ACCOUNT environment variable is required');
    }

    this.client = new BlobStorageClient({
      account,
      accountKey,
      logger: {
        debug: (...args) => this.logger.debug(args),
        info: (...args) => this.logger.log(args),
        error: (...args) => this.logger.error(args),
      },
    });

    this.logger.log(`BlobService initialized with account: ${account}`);
  }

  /**
   * Download blob from Azure Storage
   */
  async downloadBlob(container: string, blobName: string): Promise<Buffer> {
    return this.client.downloadBlob(container, blobName);
  }

  /**
   * Upload buffer to Azure Storage
   */
  async uploadBuffer(
    container: string,
    blobName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return this.client.uploadBuffer(container, blobName, buffer, contentType);
  }

  /**
   * Check if blob exists
   */
  async blobExists(container: string, blobName: string): Promise<boolean> {
    return this.client.blobExists(container, blobName);
  }

  /**
   * Get container client for advanced operations
   * Exposes Azure SDK ContainerClient directly
   */
  getContainerClient(containerName: string): ContainerClient {
    return this.client.getContainerClient(containerName);
  }

  /**
   * Delete blob if it exists
   */
  async deleteBlobIfExists(container: string, blobName: string): Promise<void> {
    const containerClient = this.getContainerClient(container);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
    this.logger.log(`Deleted blob if exists: ${container}/${blobName}`);
  }
}

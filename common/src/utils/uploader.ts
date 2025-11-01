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
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import pRetry from 'p-retry';
import { createHash } from 'node:crypto';

type StructuredLogger = {
  debug: (...values: unknown[]) => void;
  info: (...values: unknown[]) => void;
  error: (...values: unknown[]) => void;
};

const defaultLogger: StructuredLogger = {
  debug: (...values) => console.debug('[BlobStorageClient]', ...values),
  info: (...values) => console.info('[BlobStorageClient]', ...values),
  error: (...values) => console.error('[BlobStorageClient]', ...values),
};

export interface BlobStorageClientOptions {
  account?: string;
  accountKey?: string;
  logger?: StructuredLogger;
}

/**
 * BlobStorageClient centralizes Azure Storage interactions so callers can reuse a single instance.
 */
export class BlobStorageClient {
  private readonly blobServiceClient: BlobServiceClient;
  private readonly logger: StructuredLogger;
  private readonly retryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 250,
    randomize: true,
  } as const;

  constructor(private readonly options: BlobStorageClientOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
    this.blobServiceClient = this.createBlobServiceClient();
  }

  private createBlobServiceClient(): BlobServiceClient {
    const account = this.options.account ?? process.env.AZURE_STORAGE_ACCOUNT;
    if (!account) {
      throw new Error('AZURE_STORAGE_ACCOUNT missing');
    }

    const key = this.options.accountKey ?? process.env.AZURE_STORAGE_ACCOUNT_KEY;
    if (key) {
      this.logger.debug('Creating BlobServiceClient with shared key');
      return new BlobServiceClient(
        `https://${account}.blob.core.windows.net`,
        new StorageSharedKeyCredential(account, key),
      );
    }

    this.logger.debug('Creating BlobServiceClient with DefaultAzureCredential');
    return new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
  }

  async downloadBlob(container: string, blobName: string): Promise<Buffer> {
    this.logger.debug({ action: 'downloadBlob.start', container, blobName });
    const client = this.blobServiceClient.getContainerClient(container).getBlockBlobClient(blobName);

    const buffer = await pRetry(async () => {
      const response = await client.download();
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.readableStreamBody ?? []) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks);
    }, this.retryOptions);

    this.logger.info({
      action: 'downloadBlob.success',
      container,
      blobName,
      size: buffer.length,
      checksum: createHash('sha256').update(buffer).digest('hex'),
    });

    return buffer;
  }

  async uploadBuffer(
    container: string,
    blobName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    this.logger.debug({
      action: 'uploadBuffer.start',
      container,
      blobName,
      size: buffer.length,
      contentType,
    });

    const containerClient = this.blobServiceClient.getContainerClient(container);
    await containerClient.createIfNotExists();

    const blockClient = containerClient.getBlockBlobClient(blobName);

    await pRetry(
      async () => {
        await blockClient.uploadData(buffer, {
          blobHTTPHeaders: { blobContentType: contentType },
        });
      },
      this.retryOptions,
    );

    const url = blockClient.url;
    this.logger.info({
      action: 'uploadBuffer.success',
      container,
      blobName,
      url,
      size: buffer.length,
    });
    return url;
  }

  async blobExists(container: string, blobName: string): Promise<boolean> {
    const exists = await this.blobServiceClient
      .getContainerClient(container)
      .getBlobClient(blobName)
      .exists();

    this.logger.debug({ action: 'blobExists', container, blobName, exists });
    return exists;
  }
}

// Shared singleton used by most callers.
const sharedBlobClient = new BlobStorageClient();

export const blobClient = sharedBlobClient;
export const downloadBlob = sharedBlobClient.downloadBlob.bind(sharedBlobClient);
export const uploadBuffer = sharedBlobClient.uploadBuffer.bind(sharedBlobClient);
export const blobExists = sharedBlobClient.blobExists.bind(sharedBlobClient);

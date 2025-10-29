// webapi/src/upload/upload.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { BlobServiceClient, StorageSharedKeyCredential, BlockBlobClient } from '@azure/storage-blob';
import { QueueServiceClient, StorageSharedKeyCredential as QueueCredential } from '@azure/storage-queue';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { IndexingJobMessage, ArtworkMetadata, Artwork, ProcessingStatus } from 'common';

interface UploadConfig {
  account: string;
  accountKey: string;
  originalsContainer: string;
  queueName: string;
  maxUploadBytes: number;
  allowedMimeTypes: string[];
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly blobService: BlobServiceClient;
  private readonly queueService: QueueServiceClient;
  private readonly config: UploadConfig;

  constructor(private readonly prisma: PrismaService) {
    // Validate required environment variables
    this.config = {
      account: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT'),
      accountKey: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT_KEY'),
      originalsContainer: process.env.AZURE_BLOB_CONTAINER_ORIGINALS || 'originals',
      queueName: process.env.AZURE_QUEUE_NAME || 'tastematcher-dev-indexing-jobs',
      maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || '26214400'), // 25MB default
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    };

    // Initialize Azure SDK clients
    const blobCredential = new StorageSharedKeyCredential(this.config.account, this.config.accountKey);
    this.blobService = new BlobServiceClient(
      `https://${this.config.account}.blob.core.windows.net`,
      blobCredential
    );

    const queueCredential = new QueueCredential(this.config.account, this.config.accountKey);
    this.queueService = new QueueServiceClient(
      `https://${this.config.account}.queue.core.windows.net`,
      queueCredential
    );

    this.logger.log('UploadService initialized with Azure Storage integration');
  }

  async uploadFileAndEnqueue(
    domainId: string,
    fileBuffer: Buffer,
    filename: string,
    contentType: string,
    artwork: Artwork
  ): Promise<ProcessingStatus> {
    // Validate input parameters
    this.validateUploadRequest(fileBuffer, contentType, filename);

    const ext = this.extractFileExtension(filename);
    const blobName = `${domainId}/artworks/${artwork.id}/original.${ext}`;

    try {
      // Upload to Azure Blob Storage
      await this.uploadToBlob(blobName, fileBuffer, contentType);

      // Create artwork record in database
      await this.createArtworkRecord(artwork.id, domainId, filename, contentType, fileBuffer.length, blobName);

      // Enqueue indexing job
      await this.enqueueIndexingJob(artwork, blobName);

      this.logger.log(`Successfully uploaded artwork ${artwork.id} for domain ${domainId}`);

      return {
        artId: artwork.id,
        status: 'enqueued',
        progress: 0
      };

    } catch (error) {
      this.logger.error(`Failed to upload artwork for domain ${domainId}:`, error);
      
      // Cleanup: attempt to delete blob if it was created
      try {
        await this.deleteBlobIfExists(blobName);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup blob ${blobName}:`, cleanupError);
      }

      throw new InternalServerErrorException('Failed to upload artwork');
    }
  }

  private validateUploadRequest(fileBuffer: Buffer, contentType: string, filename: string): void {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }

    if (fileBuffer.length > this.config.maxUploadBytes) {
      throw new BadRequestException(
        `File size ${fileBuffer.length} exceeds maximum allowed size of ${this.config.maxUploadBytes} bytes`
      );
    }

    if (!this.config.allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException(
        `Unsupported content type: ${contentType}. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`
      );
    }

    if (!filename || filename.trim().length === 0) {
      throw new BadRequestException('Filename is required');
    }
  }

  private extractFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) {
      throw new BadRequestException('File must have an extension');
    }
    
    // Sanitize extension to prevent path traversal
    return ext.replace(/[^a-z0-9]/gi, '');
  }

  private async uploadToBlob(blobName: string, fileBuffer: Buffer, contentType: string): Promise<void> {
    try {
      // Ensure container exists
      const containerClient = this.blobService.getContainerClient(this.config.originalsContainer);
      await containerClient.createIfNotExists({
        access: 'blob' // Allow public read access to blobs
      });

      // Upload the file
      const blockBlobClient: BlockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const uploadResponse = await blockBlobClient.uploadData(fileBuffer, {
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
            this.logger.debug(`Upload progress: ${progress.loadedBytes} bytes uploaded`);
          }
        },
      });

      this.logger.debug(`Successfully uploaded blob ${blobName}, ETag: ${uploadResponse.etag}`);
      
    } catch (error) {
      this.logger.error(`Failed to upload blob ${blobName}:`, error);
      throw new InternalServerErrorException('Failed to upload file to storage');
    }
  }

  private async createArtworkRecord(
    artId: string,
    domainId: string,
    filename: string,
    contentType: string,
    fileSize: number,
    blobName: string,
  ): Promise<void> {
    try {
      // TODO : Add artwork metadata handling
      await this.prisma.artwork.create({
        data: {
          id: artId,
          domainId,
          originalBlob: blobName,
          contentType,
          size: fileSize,
          isIndexed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.debug(`Created artwork record ${artId} in database`);
      
    } catch (error) {
      this.logger.error(`Failed to create artwork record ${artId}:`, error);
      throw new InternalServerErrorException('Failed to create artwork record');
    }
  }

  private async enqueueIndexingJob(
    artwork: Artwork,
    blobName: string,
  ): Promise<void> {
    const job: IndexingJobMessage = {
      messageId: uuidv4(),
      artId: artwork.id,
      domainId: artwork.domainId,
      blobName,
      artwork: artwork,
      attempt: 0,
      enqueuedAt: new Date().getTime(),
    };

    try {
      const queueClient = this.queueService.getQueueClient(this.config.queueName);
      await queueClient.createIfNotExists();

      const messageText = Buffer.from(JSON.stringify(job)).toString('base64');
      await queueClient.sendMessage(messageText);

      this.logger.log(`Enqueued indexing job for artId=${artwork.id} (messageId=${job.messageId})`);
      
    } catch (error) {
      this.logger.error(`Failed to enqueue indexing job for ${artwork.id}:`, error);
      throw new InternalServerErrorException('Failed to enqueue processing job');
    }
  }

  private async deleteBlobIfExists(blobName: string): Promise<void> {
    try {
      const containerClient = this.blobService.getContainerClient(this.config.originalsContainer);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      this.logger.debug(`Cleaned up blob ${blobName}`);
    } catch (error) {
      this.logger.warn(`Failed to delete blob ${blobName} during cleanup:`, error);
    }
  }

  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }
}
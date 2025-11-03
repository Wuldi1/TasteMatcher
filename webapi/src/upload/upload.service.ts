// webapi/src/upload/upload.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { BlobServiceClient, StorageSharedKeyCredential, BlockBlobClient } from '@azure/storage-blob';
import { QueueServiceClient, StorageSharedKeyCredential as QueueCredential } from '@azure/storage-queue';
import { CosmosService } from '../cosmos/cosmos.service';
import { v4 as uuidv4 } from 'uuid';
import { IndexingJobMessage, Artwork, ProcessingStatus } from '@tastematcher/common';

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

  constructor(private readonly cosmos: CosmosService) {
    // Validate required environment variables
    this.config = {
      account: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT'),
      accountKey: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT_KEY'),
      originalsContainer: process.env.AZURE_BLOB_CONTAINER_ORIGINALS || 'originals',
      queueName: process.env.IMAGE_PROCESSING_QUEUE_NAME || 'tastematcher-dev-indexing-jobs',
      maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || '26214400'), // 25MB default
      allowedMimeTypes: ['image/jpeg', 'image/jpeg', 'image/png'],
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
    file: Express.Multer.File,
    artwork: Artwork
  ): Promise<ProcessingStatus> {
    this.logger.log({
      action: 'uploadFileAndEnqueue.start',
      domainId,
      artworkId: artwork.id,
      filename: artwork.filename,
      mimeType: file.mimetype,
      artworkMetadata: JSON.stringify(artwork),
    });
    // Validate input parameters
    this.validateUploadRequest(file.buffer, file.mimetype);

    const ext = this.extractFileExtension(file.mimetype);
    const blobName = `${domainId}/artworks/${artwork.id}/original.${ext}`;

    this.logger.log(`Uploading artwork ${artwork.id} to blob storage ${blobName}`);

    try {
      // Upload to Azure Blob Storage
      const fileUrl = await this.uploadToBlob(blobName, file.buffer, file.mimetype);
      artwork.filename = fileUrl;

      // Create artwork record in database
      await this.createArtworkRecord(artwork);

      await this.enqueueIndexingJob(artwork, blobName);

      this.logger.log({
        action: 'uploadFileAndEnqueue.success',
        domainId,
        artworkId: artwork.id,
        blobName,
      });
      return {
        artId: artwork.id,
        status: 'enqueued',
        progress: 0
      };

    } catch (error) {
      this.logger.error(`Failed to upload artwork for domain ${domainId}:`, error);
      
      this.logger.log({
        action: 'uploadFileAndEnqueue.cleanup',
        blobName,
      });
      // Cleanup: attempt to delete blob if it was created
      try {
        await this.deleteBlobIfExists(blobName);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup blob ${blobName}:`, cleanupError);
      }

      throw new InternalServerErrorException('Failed to upload artwork');
    }
  }

  private validateUploadRequest(fileBuffer: Buffer, contentType: string): void {
    this.logger.log({
      action: 'validateUploadRequest',
      fileSize: fileBuffer?.length ?? 0,
      contentType
    });
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

    this.logger.log({
      action: 'validateUploadRequest.success',
      fileBufferSize: fileBuffer.length,
      contentType,
    });
  }

  private extractFileExtension(mimeType: string): string {
    this.logger.log({
      action: 'extractFileExtension',
      mimeType,
    });
    const ext = mimeType.split('/').pop()?.toLowerCase();
    if (!ext) {
      throw new BadRequestException('File must have an extension');
    }
    
    // Sanitize extension to prevent path traversal
    return ext.replace(/[^a-z0-9]/gi, '');
  }

  private async uploadToBlob(blobName: string, fileBuffer: Buffer, contentType: string): Promise<string> {
    this.logger.log({
      action: 'uploadToBlob.start',
      blobName,
      contentType,
      size: fileBuffer.length,
    });
    try {
      // Ensure container exists
      const containerClient = this.blobService.getContainerClient(this.config.originalsContainer);
      this.logger.log(`Ensuring container ${this.config.originalsContainer} exists`);

      await containerClient.createIfNotExists();

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

      this.logger.log({
        action: 'uploadToBlob.success',
        blobName,
        fileUrl: blockBlobClient.url
      });

      return blockBlobClient.url;
    } catch (error) {
      this.logger.error(`Failed to upload blob ${blobName}:`, error);
      throw new InternalServerErrorException('Failed to upload file to storage');
    }
  }

  private async createArtworkRecord(
    artwork: Artwork,
  ): Promise<void> {
    this.logger.log({
      action: 'createArtworkRecord.start',
      artworkId: artwork.id,
      domainId: artwork.domainId,
    });
    try {
      artwork.createdAt = Date.now();

      const artworksContainer = await this.cosmos.getArtworksContainer();
      await artworksContainer.items.create(artwork);

      this.logger.log({
        action: 'createArtworkRecord.success',
        artworkId: artwork.id,
      });
      
    } catch (error) {
      this.logger.error(`Failed to create artwork record ${artwork.id}:`, error);
      throw new InternalServerErrorException('Failed to create artwork record');
    }
  }

  private async enqueueIndexingJob(
    artwork: Artwork,
    blobName: string,
  ): Promise<void> {
    this.logger.log({
      action: 'enqueueIndexingJob.start',
      artworkId: artwork.id,
      domainId: artwork.domainId,
      blobName,
    });
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

      this.logger.log({
        action: 'enqueueIndexingJob.success',
        artworkId: artwork.id,
        messageId: job.messageId,
      });
      
    } catch (error) {
      this.logger.error(`Failed to enqueue indexing job for ${artwork.id}:`, error);
      throw new InternalServerErrorException('Failed to enqueue processing job');
    }
  }

  private async deleteBlobIfExists(blobName: string): Promise<void> {
    this.logger.log({
      action: 'deleteBlobIfExists.start',
      blobName,
    });
    try {
      const containerClient = this.blobService.getContainerClient(this.config.originalsContainer);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      this.logger.log({
        action: 'deleteBlobIfExists.success',
        blobName,
      });
    } catch (error) {
      this.logger.warn(`Failed to delete blob ${blobName} during cleanup:`, error);
    }
  }

  private getRequiredEnv(key: string): string {
    this.logger.log({
      action: 'getRequiredEnv',
      key,
    });
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }
}
// workers/src/indexer/index.ts
import { app, InvocationContext } from '@azure/functions';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { IndexingJobMessage } from 'common';

interface ThumbnailConfig {
  name: string;
  width: number;
  height: number;
  quality: number;
}

class ArtworkIndexer {
  private readonly prisma: PrismaClient;
  private readonly blobService: BlobServiceClient;
  private readonly searchClient: SearchClient<any>;
  private readonly config: {
    storageAccount: string;
    storageKey: string;
    originalsContainer: string;
    derivativesContainer: string;
    searchEndpoint: string;
    searchKey: string;
    searchIndex: string;
  };

  private readonly thumbnailConfigs: ThumbnailConfig[] = [
    { name: 'small', width: 150, height: 150, quality: 80 },
    { name: 'medium', width: 400, height: 400, quality: 85 },
    { name: 'large', width: 800, height: 800, quality: 90 },
  ];

  constructor() {
    // Validate and load configuration
    this.config = {
      storageAccount: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT'),
      storageKey: this.getRequiredEnv('AZURE_STORAGE_ACCOUNT_KEY'),
      originalsContainer: process.env.AZURE_BLOB_CONTAINER_ORIGINALS || 'originals',
      derivativesContainer: process.env.AZURE_BLOB_CONTAINER_DERIVATIVES || 'derivatives',
      searchEndpoint: this.getRequiredEnv('AZURE_SEARCH_ENDPOINT'),
      searchKey: this.getRequiredEnv('AZURE_SEARCH_ADMIN_KEY'),
      searchIndex: process.env.AZURE_SEARCH_INDEX_NAME || 'artworks-index',
    };

    // Initialize Azure SDK clients
    const storageCredential = new StorageSharedKeyCredential(
      this.config.storageAccount,
      this.config.storageKey
    );
    this.blobService = new BlobServiceClient(
      `https://${this.config.storageAccount}.blob.core.windows.net`,
      storageCredential
    );

    this.searchClient = new SearchClient(
      this.config.searchEndpoint,
      this.config.searchIndex,
      new AzureKeyCredential(this.config.searchKey)
    );

    this.prisma = new PrismaClient();
  }

  async processIndexingJob(job: IndexingJobMessage, context: InvocationContext): Promise<void> {
    context.log(`Processing indexing job for artwork ${job.artId}`);

    try {
      // Check if already processed
      const artwork = await this.prisma.artwork.findUnique({
        where: { id: job.artId },
        include: { domain: true }
      });

      if (!artwork) {
        context.warn(`Artwork ${job.artId} not found in database, skipping`);
        return;
      }

      if (artwork.isIndexed && artwork.checksum) {
        context.log(`Artwork ${job.artId} already indexed, skipping`);
        return;
      }

      // Download original image from blob storage
      const imageBuffer = await this.downloadBlob(job.blobName, job.container || this.config.originalsContainer);
      
      // Validate image and compute checksum
      const checksum = this.computeChecksum(imageBuffer);
      await this.validateImage(imageBuffer);

      // Generate thumbnails
      const thumbnailUrls = await this.generateThumbnails(
        job.domainId,
        job.artId,
        imageBuffer,
        context
      );

      // Generate embeddings (stub for now)
      const embeddings = await this.generateEmbeddings(imageBuffer, artwork, context);

      // Index in Azure Cognitive Search
      await this.indexInSearch(job.artId, job.domainId, artwork, embeddings, context);

      // Update database record
      await this.updateArtworkRecord(job.artId, checksum, thumbnailUrls, context);

      context.log(`Successfully processed artwork ${job.artId}`);

    } catch (error) {
      context.error(`Failed to process artwork ${job.artId}:`, error);
      
      // Update error in database
      await this.recordIndexingError(job.artId, error, context);
      
      // Re-throw for Azure Functions retry mechanism
      throw error;
    }
  }

  private async downloadBlob(blobName: string, containerName: string): Promise<Buffer> {
    const containerClient = this.blobService.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    
    const downloadResponse = await blobClient.download();
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob ${blobName}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  }

  private computeChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async validateImage(imageBuffer: Buffer): Promise<void> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image: missing dimensions');
      }

      if (metadata.width > 10000 || metadata.height > 10000) {
        throw new Error('Image dimensions too large');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Image validation failed: ${errorMessage}`);
    }
  }

  private async generateThumbnails(
    domainId: string,
    artId: string,
    imageBuffer: Buffer,
    context: InvocationContext
  ): Promise<Record<string, string>> {
    const thumbnailUrls: Record<string, string> = {};
    const derivativesContainer = this.blobService.getContainerClient(this.config.derivativesContainer);
    
    // Ensure derivatives container exists
    await derivativesContainer.createIfNotExists();

    for (const config of this.thumbnailConfigs) {
      try {
        context.log(`Generating ${config.name} thumbnail for artwork ${artId}`);
        
        // Generate thumbnail using sharp
        const thumbnailBuffer = await sharp(imageBuffer)
          .resize(config.width, config.height, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: config.quality })
          .toBuffer();

        // Upload thumbnail to blob storage
        const thumbnailBlobName = `${domainId}/artworks/${artId}/derivatives/${config.name}.jpg`;
        const thumbnailBlobClient = derivativesContainer.getBlockBlobClient(thumbnailBlobName);
        
        await thumbnailBlobClient.uploadData(thumbnailBuffer, {
          blobHTTPHeaders: {
            blobContentType: 'image/jpeg',
            blobCacheControl: 'public, max-age=31536000', // 1 year cache
          }
        });

        // Store URL (assuming public access or CDN)
        thumbnailUrls[config.name] = thumbnailBlobClient.url;
        
      } catch (error) {
        context.warn(`Failed to generate ${config.name} thumbnail for ${artId}:`, error);
        // Continue with other thumbnails
      }
    }

    return thumbnailUrls;
  }

  private async generateEmbeddings(
    imageBuffer: Buffer,
    artwork: any,
    context: InvocationContext
  ): Promise<number[]> {
    // TODO: Implement actual image embedding generation
    // This could use Azure Computer Vision, OpenAI CLIP, or another embedding model
    context.log(`Generating embeddings for artwork ${artwork.id} (stubbed)`);
    
    // Return dummy 1536-dimensional embedding for now
    return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  }

  private async indexInSearch(
    artId: string,
    domainId: string,
    artwork: any,
    embeddings: number[],
    context: InvocationContext
  ): Promise<void> {
    try {
      const searchDocument = {
        artworkId: artId,
        domainId: domainId,
        price: 0, // TODO: Add price field to artwork model
        isActive: true,
        embedding_vector: embeddings,
        // Add other searchable fields as needed
        title: artwork.title || '',
        artist: artwork.artist || '',
        createdAt: artwork.createdAt.toISOString(),
      };

      await this.searchClient.uploadDocuments([searchDocument]);
      context.log(`Successfully indexed artwork ${artId} in search`);
      
    } catch (error) {
      context.error(`Failed to index artwork ${artId} in search:`, error);
      throw error;
    }
  }

  private async updateArtworkRecord(
    artId: string,
    checksum: string,
    thumbnailUrls: Record<string, string>,
    context: InvocationContext
  ): Promise<void> {
    try {
      await this.prisma.artwork.update({
        where: { id: artId },
        data: {
          checksum,
          thumbnailJson: JSON.stringify(thumbnailUrls),
          isIndexed: true,
          lastIndexedAt: new Date(),
          indexingError: null, // Clear any previous errors
          updatedAt: new Date(),
        },
      });

      context.log(`Updated artwork record ${artId} with indexing results`);
      
    } catch (error) {
      context.error(`Failed to update artwork record ${artId}:`, error);
      throw error;
    }
  }

  private async recordIndexingError(
    artId: string,
    error: any,
    context: InvocationContext
  ): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.prisma.artwork.update({
        where: { id: artId },
        data: {
          indexingError: errorMessage,
          updatedAt: new Date(),
        },
      });

      context.log(`Recorded indexing error for artwork ${artId}`);
      
    } catch (dbError) {
      context.error(`Failed to record indexing error for ${artId}:`, dbError);
    }
  }

  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Azure Functions v4 handler
app.storageQueue('indexer', {
  queueName: '%AZURE_QUEUE_NAME%',
  connection: 'AzureWebJobsStorage',
  handler: async (queueItem: unknown, context: InvocationContext): Promise<void> => {
    let indexer: ArtworkIndexer | null = null;
    
    try {
      // Parse the queue message
      let job: IndexingJobMessage;
      
      if (typeof queueItem === 'string') {
        // Message is base64 encoded JSON
        const decodedMessage = Buffer.from(queueItem, 'base64').toString('utf-8');
        job = JSON.parse(decodedMessage);
      } else {
        job = queueItem as IndexingJobMessage;
      }

      context.log(`Received indexing job: ${JSON.stringify(job)}`);

      // Validate message
      if (!job.artId || !job.domainId || !job.blobName) {
        throw new Error('Invalid job message: missing required fields');
      }

      // Process the job
      indexer = new ArtworkIndexer();
      await indexer.processIndexingJob(job, context);

    } catch (error) {
      context.error('Indexer function failed:', error);
      throw error; // Re-throw to trigger Azure Functions retry
    } finally {
      if (indexer) {
        await indexer.cleanup();
      }
    }
  }
});
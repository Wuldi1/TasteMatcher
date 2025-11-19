// webapi/src/upload/upload.controller.ts
import {
  Controller,
  Post,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Artwork, BlobService, CosmosService, getOriginalBlobPath, ImageProcessingQueueMessage, ProcessingStatus } from '@tastematcher/common';
import { v4 as uuidv4 } from 'uuid';

@Controller('api/domains/:domainId/uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);
  private readonly blobService: BlobService;
  private readonly cosmosService: CosmosService;

  constructor() {
    this.blobService = new BlobService();
    this.cosmosService = new CosmosService();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadArtwork(
    @Param('domainId') domainId: string,
    // eslint-disable-next-line
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ): Promise<ProcessingStatus> {
    const start = Date.now();
    this.logger.debug({
      route: '/api/domains/:domainId/uploads',
      method: 'POST',
      domainId,
      metadataKeys: Object.keys(body),
    });

    if (!file) {
      throw new BadRequestException('File is required');
    }

    try {
      this.blobService.validateImageFile(file);

      // Pass artworkData directly, not wrapped
      const artworkMetadata = this.parseArtworkPayload(body, domainId);
      const blobName = getOriginalBlobPath(domainId, artworkMetadata.id, file.mimetype);

      this.logger.debug({
        action: 'uploadArtwork.start',
        artworkId: artworkMetadata.id,
        domainId,
        blobName,
        containerId: "originals",
        fileSize: file.size,
        fileMimeType: file.mimetype,
        artworkObject: artworkMetadata,
      });

      // upload file to blob storage
      const artworkUrl = await this.blobService.uploadBlob("originals", blobName, file.buffer, file.mimetype);
      artworkMetadata.filename = artworkUrl;

      // write artwork record to database
      artworkMetadata.createdAt = Date.now();

      const artworksContainer = await this.cosmosService.getArtworksContainer();
      await artworksContainer.items.create(artworkMetadata);

      this.logger.log({
        action: 'createArtworkRecord.success',
        artworkId: artworkMetadata.id,
      });


      // send message to queue for additional processing (thumbnail generation, vectorization, indexing)
      const imageProcessingQueueMessage: ImageProcessingQueueMessage = {
        messageId: uuidv4(),
        artworkId: artworkMetadata.id,
        domainId: artworkMetadata.domainId,
        blobName,
        fileUrl: artworkMetadata.filename,
        uploadedAt: Date.now(),
      };
      await this.blobService.sendMessageToQueue(imageProcessingQueueMessage);

      this.logger.log({
        route: '/api/domains/:domainId/uploads',
        method: 'POST',
        domainId,
        durationMs: Date.now() - start,
      });

      // TODO : this is a stupid response, fix it
      return {
        artworkId: artworkMetadata.id,
        status: 'enqueued',
        progress: 0
      };

    } catch (error) {
      this.logger.error({
        route: '/api/domains/:domainId/uploads',
        method: 'POST',
        domainId,
        errMessage: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  private parseArtworkPayload(body: any, domainId: string): Artwork {
    // Accept direct artwork object or legacy { artwork } or { metadata }

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new BadRequestException('Invalid artwork metadata payload');
      }
    } else if (body && typeof body === 'object') {
      // If body has 'artwork' or 'metadata', use it; otherwise, use body directly
      if ('artwork' in body) {
        body = (body as any).artwork as Partial<Artwork>;
      } else if ('metadata' in body) {
        body = (body as any).metadata as Partial<Artwork>;
      } else {
        body = body as Partial<Artwork>;
      }
    }

    const parsed: Partial<Artwork> = JSON.parse(body as string) as Partial<Artwork>;

    return {
      id: uuidv4(),
      domainId,
      title: parsed.title!,
      artist: parsed.artist!,
      description: parsed.description!,
      classification: parsed.classification ?? '',
      department: parsed.department ?? '',
      country: parsed.country ?? '',
      date: parsed.date ?? '',
      filename: parsed.filename ?? 'unknown',
      tags: parsed.tags ?? [],
      createdAt: new Date().getTime(),
      metadata: parsed.metadata,
      category: parsed.category ?? 'uncategorized',
      vector: [],
      vectorModel: '',
    } as Artwork;
  }
}
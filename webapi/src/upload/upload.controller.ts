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
    // eslint-disable-next-line no-undef
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ): Promise<ProcessingStatus> {
    const start = Date.now();
    this.logger.debug({
      route: '/domains/:domainId/uploads',
      method: 'POST',
      domainId,
      metadataKeys: Object.keys(body),
    });

    if (!file) {
      throw new BadRequestException('File is required');
    }

    try {
      const artworkMetadata = this.parseArtworkPayload(body, domainId);
      const fileExtension = this.extractFileExtension(file.mimetype);
      const blobName = getOriginalBlobPath(domainId, artworkMetadata.id, fileExtension);

      this.logger.debug({
        action: 'uploadArtwork.start',
        artworkId: artworkMetadata.id,
        domainId,
        blobName,
        containerId: "originals",
        fileSize: file.size,
        fileMimeType: file.mimetype,
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
        route: '/domains/:domainId/uploads',
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
        route: '/domains/:domainId/uploads',
        method: 'POST',
        domainId,
        errMessage: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
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

  private parseArtworkPayload(body: Record<string, unknown>, domainId: string): Artwork {
    const raw = body.artwork ?? body.metadata;
    let parsed: Partial<Artwork> = {};

    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as Partial<Artwork>;
      } catch {
        throw new BadRequestException('Invalid artwork metadata payload');
      }
    } else if (raw && typeof raw === 'object') {
      parsed = raw as Partial<Artwork>;
    }

    return {
      id: uuidv4(),
      domainId,
      title: parsed.title!,
      artist: parsed.artist!,
      description: parsed.description!,
      filename: parsed.filename ?? 'unknown',
      tags: parsed.tags ?? [],
      createdAt: new Date().getTime(),
      metadata: parsed.metadata,
      category: parsed.category ?? 'uncategorized',
    } as Artwork;
  }
}
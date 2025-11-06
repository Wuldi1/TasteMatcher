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
import { UploadService } from './upload.service';
import { Artwork, ProcessingStatus } from '@tastematcher/common';
import { v4 as uuidv4 } from 'uuid';

@Controller('domains/:domainId/uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

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

    const artworkMetadata = this.parseArtworkPayload(body, domainId);

    try {
      const response = await this.uploadService.uploadFileAndEnqueue(domainId, file, artworkMetadata);
      this.logger.log({
        route: '/domains/:domainId/uploads',
        method: 'POST',
        domainId,
        durationMs: Date.now() - start,
      });
      return response;
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
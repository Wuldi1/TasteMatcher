// webapi/src/upload/upload.controller.ts
import {
  Controller,
  Post,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Artwork, ArtworkMetadata, ProcessingStatus } from 'common';
import { v4 as uuidv4 } from 'uuid';

@Controller('domains/:domainId/uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadArtwork(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('artwork') artwork: Artwork,
  ): Promise<ProcessingStatus> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    this.logger.log(`Uploading artwork to domain ${domainId}: ${file.originalname}`);

    artwork.id = uuidv4();
    artwork.domainId = domainId;

    return this.uploadService.uploadFileAndEnqueue(
      domainId,
      file.buffer,
      file.originalname,
      file.mimetype,
      artwork
    );
  }
}
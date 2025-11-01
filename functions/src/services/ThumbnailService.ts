import sharp from 'sharp';
import type { ThumbnailResult, ThumbnailSize } from '@tastematcher/common';
import { createLogger } from '../lib/logger';
import { BlobService } from './BlobService';
import type { Config } from '../lib/config';

const logger = createLogger('ThumbnailService');

const THUMBNAIL_SIZES: ThumbnailSize[] = [
  { name: 'small', width: 150, height: 150 },
  { name: 'medium', width: 300, height: 300 },
  { name: 'large', width: 600, height: 600 },
];

/**
 * Service for generating image thumbnails at multiple sizes
 */
export class ThumbnailService {
  private blobService: BlobService;
  private containerName = 'thumbnails';

  constructor(config: Config) {
    this.blobService = new BlobService(config);
  }

  /**
   * Generates thumbnails at predefined sizes and uploads them to blob storage
   */
  async generateThumbnails(
    imageBuffer: Buffer,
    artworkId: string
  ): Promise<ThumbnailResult[]> {
    logger.debug({
      msg: 'Generating thumbnails',
      artworkId,
      sizes: THUMBNAIL_SIZES.length,
    });

    const results: ThumbnailResult[] = [];

    for (const size of THUMBNAIL_SIZES) {
      try {
        const thumbnailBuffer = await sharp(imageBuffer)
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        const blobName = `${artworkId}/${size.name}.jpg`;
        const blobUrl = await this.blobService.uploadBlob(
          this.containerName,
          blobName,
          thumbnailBuffer,
          'image/jpeg'
        );

        results.push({
          size: size.name,
          blobUrl,
          width: size.width,
          height: size.height,
        });

        logger.debug({
          msg: 'Thumbnail generated',
          artworkId,
          size: size.name,
          blobUrl,
        });

      } catch (error) {
        logger.error({
          msg: 'Failed to generate thumbnail',
          artworkId,
          size: size.name,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        throw new Error(
          `Failed to generate ${size.name} thumbnail: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    logger.info({
      msg: 'All thumbnails generated',
      artworkId,
      count: results.length,
    });

    return results;
  }
}

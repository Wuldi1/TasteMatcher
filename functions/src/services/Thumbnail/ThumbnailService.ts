// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses jimp (pure JavaScript) instead of sharp (native module).
// 3. Cross-platform compatible - no native dependencies.
// 4. Adds structured logging at function entry/exit and on errors.
// 5. No duplicate logic — reuses existing BlobService.
// -----------------------------------------------------------

import Jimp from 'jimp';
import { getDerivativeBlobPath, getThumbnailSizeFromDimensions, ThumbnailInfo } from '@tastematcher/common';
import type { ThumbnailSize } from '@tastematcher/common';
import { createLogger } from '../../lib/logger';
import { BlobService } from '../Blob/BlobService';
import type { AppConfig } from '../../config';

const logger = createLogger('ThumbnailService');

const THUMBNAIL_SIZES: ThumbnailSize[] = [
  { width: 150, height: 150 },
  { width: 300, height: 300 },
  { width: 600, height: 600 },
];

/**
 * Service for generating image thumbnails at multiple sizes using Jimp.
 * Jimp is a pure JavaScript image processing library with no native dependencies,
 * ensuring cross-platform compatibility and easier deployment to Azure Functions.
 */
export class ThumbnailService {
  private blobService: BlobService;
  private containerName: string;

  constructor(config: AppConfig) {
    this.blobService = new BlobService(config);
    this.containerName = config.azure.storageContainerThumbnails || 'derivatives';
  }

  /**
   * Generates thumbnails at predefined sizes and uploads them to blob storage
   */
  async generateAndUploadThumbnails(
    imageBuffer: Buffer,
    domainId: string,
    artworkId: string
  ): Promise<ThumbnailInfo[]> {
    logger.debug({
      msg: 'Generating thumbnails with Jimp',
      artworkId,
      sizes: THUMBNAIL_SIZES.length,
      imageSizeBytes: imageBuffer.length,
    });

    const results: ThumbnailInfo[] = [];

    try {
      // Load the image once with Jimp
      const image = await Jimp.read(imageBuffer);

      for (const size of THUMBNAIL_SIZES) {
        try {
          // Clone the image for each size to avoid mutating the original
          const thumbnail = image.clone();

          // Resize maintaining aspect ratio - scales to fit within bounds
          // This preserves the original image ratio instead of cropping
          thumbnail.scaleToFit(size.width, size.height);

          // Set JPEG quality
          thumbnail.quality(85);

          // Convert to buffer
          const thumbnailBuffer = await thumbnail.getBufferAsync(Jimp.MIME_JPEG);

          // Get actual dimensions after resize (may be smaller than requested to maintain ratio)
          const actualWidth = thumbnail.getWidth();
          const actualHeight = thumbnail.getHeight();

          const blobName = getDerivativeBlobPath(domainId, artworkId, getThumbnailSizeFromDimensions(size.width, size.height));
          const blobUrl = await this.blobService.uploadBlob(
            this.containerName,
            blobName,
            thumbnailBuffer,
            'image/jpeg'
          );

          results.push({
            url: blobUrl,
            width: actualWidth,
            height: actualHeight,
          });

          logger.debug({
            msg: 'Thumbnail generated',
            artworkId,
            requestedSize: `${size.width}x${size.height}`,
            actualSize: `${actualWidth}x${actualHeight}`,
            blobUrl,
            thumbnailSizeBytes: thumbnailBuffer.length,
          });

        } catch (error) {
          logger.error({
            msg: 'Failed to generate thumbnail for size',
            artworkId,
            size: `${size.width}x${size.height}`,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          throw new Error(
            `Failed to generate thumbnail (${size.width}x${size.height}): ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      logger.info({
        msg: 'All thumbnails generated successfully',
        artworkId,
        count: results.length,
      });

      return results;

    } catch (error) {
      logger.error({
        msg: 'Failed to load image with Jimp',
        artworkId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new Error(
        `Failed to process image: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}

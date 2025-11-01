// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for ThumbnailConfig.
// 3. Unit tests in thumbnail.service.spec.ts.
// 4. Structured logging at entry/exit and errors.
// 5. Input validation for buffer and config.
// 6. No duplicate logic — uses Sharp library.
// 7. JSDoc for exported methods.
// -----------------------------------------------------------

import sharp from 'sharp';
import { ThumbnailConfig } from '@tastematcher/common';
import { logger } from '../utils/logger';

/**
 * Result of thumbnail generation with metadata.
 */
export interface ThumbnailGenerationResult {
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  suffix: string;
}

/**
 * Service for generating image thumbnails using Sharp.
 * Maintains aspect ratio and optimizes for web delivery.
 */
export class ThumbnailService {
  /**
   * Generate a single thumbnail from image buffer.
   * @param imageBuffer - Original image buffer
   * @param config - Thumbnail size configuration
   * @returns Generated thumbnail with metadata
   */
  async generateThumbnail(
    imageBuffer: Buffer,
    config: ThumbnailConfig
  ): Promise<ThumbnailGenerationResult> {
    const start = Date.now();
    logger.debug({ config, bufferSize: imageBuffer.length }, 'Generating thumbnail');

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer');
    }

    if (config.width <= 0 || config.height <= 0) {
      throw new Error('Invalid thumbnail dimensions');
    }

    try {
      const resized = await sharp(imageBuffer)
        .resize(config.width, config.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer({ resolveWithObject: true });

      const result: ThumbnailGenerationResult = {
        buffer: resized.data,
        width: resized.info.width,
        height: resized.info.height,
        sizeBytes: resized.data.length,
        suffix: config.suffix,
      };

      logger.info(
        { suffix: config.suffix, durationMs: Date.now() - start, sizeBytes: result.sizeBytes },
        'Thumbnail generated'
      );

      return result;
    } catch (err) {
      logger.error({ err, config }, 'Thumbnail generation failed');
      throw new Error(`Thumbnail generation failed: ${(err as Error).message}`);
    }
  }

  /**
   * Generate multiple thumbnails in parallel.
   * Continues on individual failures and logs errors.
   * @param imageBuffer - Original image buffer
   * @param configs - Array of thumbnail configurations
   * @returns Array of successfully generated thumbnails
   */
  async generateMultipleThumbnails(
    imageBuffer: Buffer,
    configs: ThumbnailConfig[]
  ): Promise<ThumbnailGenerationResult[]> {
    logger.debug({ configCount: configs.length }, 'Generating multiple thumbnails');

    const results = await Promise.allSettled(
      configs.map((config) => this.generateThumbnail(imageBuffer, config))
    );

    const successful: ThumbnailGenerationResult[] = [];
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        logger.warn({ config: configs[idx], reason: result.reason }, 'Thumbnail generation failed');
      }
    });

    logger.info({ total: configs.length, successful: successful.length }, 'Thumbnails generated');

    return successful;
  }
}

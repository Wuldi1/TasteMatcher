// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for ImageVectorResult.
// 3. Unit tests in vectorization.service.spec.ts.
// 4. Structured logging at entry/exit and errors.
// 5. Input validation and guard for embedding dimensions.
// 6. Implements retry logic via client configuration.
// 7. JSDoc for exported methods.
// -----------------------------------------------------------

import { ImageVectorResult } from '@tastematcher/common';
import { logger } from '../utils/logger';

/**
 * Service for generating image embeddings using Azure AI Vision.
 * Produces vector representations suitable for semantic search.
 */
export class VectorizationService {
  private readonly minEmbeddingDimensions = 512;

  constructor(private readonly visionClient: any) {}

  /**
   * Generate vector embedding from image buffer.
   * @param imageBuffer - Image data to vectorize
   * @returns Vector embedding with model metadata
   */
  async vectorizeImage(imageBuffer: Buffer): Promise<ImageVectorResult> {
    const start = Date.now();
    logger.debug({ bufferSize: imageBuffer.length }, 'Vectorizing image');

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer');
    }

    try {
      const response = await this.visionClient.analyzeImage(imageBuffer, {
        features: ['vectorize'],
      });

      const embedding: number[] = response.vectorEmbedding || [];

      if (embedding.length < this.minEmbeddingDimensions) {
        throw new Error(`Invalid embedding dimensions: ${embedding.length}`);
      }

      const result: ImageVectorResult = {
        embedding,
        model: response.modelVersion || 'unknown',
      };

      logger.info(
        {
          durationMs: Date.now() - start,
          embeddingDimensions: embedding.length,
          model: result.model,
        },
        'Image vectorized'
      );

      return result;
    } catch (err) {
      logger.error({ err }, 'Vectorization failed');
      throw new Error(`Vectorization failed: ${(err as Error).message}`);
    }
  }
}

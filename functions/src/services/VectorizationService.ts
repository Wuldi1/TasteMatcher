import OpenAI from 'openai';
import type { VectorEmbedding } from '@tastematcher/common';
import { createLogger } from '../lib/logger';
import type { Config } from '../lib/config';

const logger = createLogger('VectorizationService');

/**
 * Service for generating vector embeddings from images
 */
export class VectorizationService {
  private openai: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.model = config.openaiEmbeddingModel;
  }

  /**
   * Generates vector embedding for an image using OpenAI
   * Note: Currently uses text embedding as placeholder.
   * For production, use OpenAI Vision API or Azure Computer Vision.
   */
  async generateEmbedding(imageBuffer: Buffer): Promise<VectorEmbedding> {
    const maxRetries = 3;
    const baseDelay = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({
          msg: 'Generating embedding',
          model: this.model,
          attempt: attempt + 1,
          imageSizeBytes: imageBuffer.length,
        });

        // TODO: Replace with actual image embedding when available
        // For now, using a placeholder based on image metadata
        const imageMetadata = `image_size:${imageBuffer.length}`;
        
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: imageMetadata,
        });

        const embedding = response.data[0].embedding;

        logger.debug({
          msg: 'Embedding generated',
          model: this.model,
          dimensions: embedding.length,
        });

        return {
          vector: embedding,
          model: this.model,
        };

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        logger.warn({
          msg: 'Embedding generation failed',
          model: this.model,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : 'Unknown',
          willRetry: !isLastAttempt,
        });

        if (isLastAttempt) {
          throw new Error(
            `Failed to generate embedding after ${maxRetries + 1} attempts: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Unexpected: retry loop completed without return or throw');
  }
}

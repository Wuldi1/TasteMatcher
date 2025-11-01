import ImageAnalysisClient from '@azure-rest/ai-vision-image-analysis';
import { AzureKeyCredential } from '@azure/core-auth';
import type { VectorEmbedding } from '@tastematcher/common';
import { createLogger } from '../../lib/logger';
import type { Config } from '../../lib/config';

const logger = createLogger('VectorizationService');

/**
 * Service for generating vector embeddings from images using Azure AI Vision
 */
export class VectorizationService {
  private visionClient: ReturnType<typeof ImageAnalysisClient>;
  private readonly minEmbeddingDimensions = 512;

  constructor(config: Config) {
    this.visionClient = ImageAnalysisClient(
      config.azure.aiVisionEndpoint,
      new AzureKeyCredential(config.azure.aiVisionKey)
    );
  }

  /**
   * Generates vector embedding for an image using Azure AI Vision
   * @param imageBuffer - Image data to vectorize
   * @param correlationId - Correlation ID for logging
   * @returns Vector embedding with model metadata
   */
  async generateEmbedding(
    imageBuffer: Buffer,
    correlationId: string
  ): Promise<VectorEmbedding> {
    const maxRetries = 3;
    const baseDelay = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({
          msg: 'Generating embedding with Azure AI Vision',
          attempt: attempt + 1,
          imageSizeBytes: imageBuffer.length,
          correlationId,
        });

        if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
          throw new Error('Invalid image buffer');
        }

        // Call Azure AI Vision to generate vector embedding
        const result = await this.visionClient.path('/imageanalysis:analyze').post({
          contentType: 'application/octet-stream',
          body: imageBuffer,
          queryParameters: {
            features: ['vectorize'] as const,
            'api-version': '2023-02-01-preview',
          },
        });

        if (result.status !== '200') {
          throw new Error(`Azure AI Vision API returned status ${result.status}: ${JSON.stringify(result.body)}`);
        }

        const body = result.body as any;
        const embedding: number[] = body.vectorResult?.values || [];

        if (embedding.length < this.minEmbeddingDimensions) {
          throw new Error(
            `Invalid embedding dimensions: ${embedding.length}, expected at least ${this.minEmbeddingDimensions}`
          );
        }

        logger.debug({
          msg: 'Embedding generated successfully',
          dimensions: embedding.length,
          model: body.modelVersion || 'unknown',
          correlationId,
        });

        return {
          vector: embedding,
          model: body.modelVersion || 'azure-vision-v4',
        };

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        logger.warn({
          msg: 'Embedding generation failed',
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : 'Unknown',
          willRetry: !isLastAttempt,
          correlationId,
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

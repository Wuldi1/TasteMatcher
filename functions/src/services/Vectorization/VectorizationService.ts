// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses Azure AI Vision Vectorize Images API for proper embeddings
// 2. Follows Azure best practices for AI Vision API
// -----------------------------------------------------------

import type { VectorEmbedding } from '@tastematcher/common';
import { createLogger } from '../../lib/logger';
import type { AppConfig } from '../../config';
import { retryWithBackoff } from '../../utils/retry';

const logger = createLogger('VectorizationService');

interface SingleVectorResultApiModel {
  vector: number[];
  modelVersion: string;
}

/**
 * Service for generating vector embeddings from images using Azure AI Vision Vectorize Images API
 */
export class VectorizationService {
  private readonly visionEndpoint: string;
  private readonly visionKey: string;
  private readonly minEmbeddingDimensions = 512;

  constructor(config: AppConfig) {
    // Remove trailing slash if present
    this.visionEndpoint = config.azure.aiVisionEndpoint.replace(/\/$/, '');
    this.visionKey = config.azure.aiVisionKey;
  }

  /**
   * Generates vector embedding for an image using Azure AI Vision Vectorize Images API
   * @param imageUrl - Public URL of the image to vectorize
   * @param correlationId - Correlation ID for logging
   * @returns Vector embedding with model metadata
   */
  async generateEmbedding(
    imageUrl: string,
    correlationId: string
  ): Promise<VectorEmbedding> {

    return await retryWithBackoff(async () => {
        logger.debug({
          msg: 'Generating embedding with Azure AI Vision Vectorize Images API',
          imageUrl,
          endpoint: this.visionEndpoint,
          correlationId,
        });

        // Correct API endpoint format for vectorization
        // Format: https://<resource-name>.cognitiveservices.azure.com/computervision/retrieval:vectorizeImage?api-version=2024-02-01
        const vectorizeUrl = `${this.visionEndpoint}/computervision/retrieval:vectorizeImage?api-version=2024-02-01&model-version=2023-04-15`;

        logger.debug({
          msg: 'Making request to Azure AI Vision',
          url: vectorizeUrl,
          correlationId,
        });

        const response = await fetch(vectorizeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': this.visionKey,
          },
          body: JSON.stringify({
            url: imageUrl
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error({
            msg: 'Azure AI Vision API error',
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            endpoint: vectorizeUrl,
            correlationId,
          });
          throw new Error(
            `Azure AI Vision Vectorize API returned status ${response.status}: ${errorText}`
          );
        }

        const result = await response.json() as SingleVectorResultApiModel;

        const embedding: number[] = result.vector || [];

        if (embedding.length < this.minEmbeddingDimensions) {
          throw new Error(
            `Invalid embedding dimensions: ${embedding.length}, expected at least ${this.minEmbeddingDimensions}`
          );
        }

        logger.debug({
          msg: 'Embedding generated successfully',
          dimensions: embedding.length,
          model: result.modelVersion || '2023-04-15',
          correlationId,
        });

        return {
          vector: embedding,
          model: result.modelVersion || 'azure-vision-vectorize-2023-04-15',
        };
      },
      {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 4,
      },
      `generateEmbedding-${correlationId}`,
      logger
    );
  }
}

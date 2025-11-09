import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import type { VectorEmbedding } from '@tastematcher/common';
import { createLogger } from '../../lib/logger';
import type { AppConfig } from '../../config';
import { retryWithBackoff } from '../../utils/retry';

const logger = createLogger('SearchIndexService');

interface ArtworkSearchDocument {
  artworkId: string;
  domainId: string;
  imageVector: number[]; // Azure AI Vision produces 1024-dimension vectors
}

interface IndexArtworkInput {
  artworkId: string;
  domainId: string;
  vectorEmbedding: VectorEmbedding;
}

/**
 * Service for indexing artwork data into Azure Cognitive Search
 */
export class SearchIndexService {
  private searchClient: SearchClient<ArtworkSearchDocument>;

  constructor(config: AppConfig) {
    this.searchClient = new SearchClient<ArtworkSearchDocument>(
      config.azure.searchEndpoint,
      config.azure.searchIndexName,
      new AzureKeyCredential(config.azure.searchKey)
    );
  }

  /**
   * Indexes artwork with thumbnails and vector embedding
   * Implements idempotency via upsert operation
   */
  async indexArtwork(input: IndexArtworkInput): Promise<void> {
    logger.debug({
      msg: 'Indexing artwork',
      artworkId: input.artworkId,
      domainId: input.domainId,
      vectorDimensions: input.vectorEmbedding.vector.length, // Log actual dimensions
    });

    // Validate vector dimensions
    if (input.vectorEmbedding.vector.length !== 1024) {
      throw new Error(
        `Invalid vector dimensions: expected 1024 (Azure AI Vision), got ${input.vectorEmbedding.vector.length}`
      );
    }

    const document: ArtworkSearchDocument = {
      artworkId: input.artworkId,
      domainId: input.domainId,
      imageVector: input.vectorEmbedding.vector,
    };

    retryWithBackoff(() => {
      return this.mergeOrUploadDocument(input, document);
    },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      }, input.artworkId, logger).catch(err => {
        logger.error({
          msg: 'Failed to index artwork after retries',
          artworkId: input.artworkId,
          domainId: input.domainId,
          err,
        });
        throw err;
      });
  }

  async mergeOrUploadDocument(input: IndexArtworkInput, document: ArtworkSearchDocument): Promise<void> {
    // Use mergeOrUpload for idempotency
    const result = await this.searchClient.mergeOrUploadDocuments([document]);

    const success = result.results.every(r => r.succeeded);

    if (!success) {
      const errors = result.results
        .filter(r => !r.succeeded)
        .map(r => r.errorMessage)
        .join(', ');
      throw new Error(`Index operation failed: ${errors}`);
    }

    logger.info({
      msg: 'Artwork indexed successfully',
      artworkId: input.artworkId,
      domainId: input.domainId,
    });

    return;
  }
}
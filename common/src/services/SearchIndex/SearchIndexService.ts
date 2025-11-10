import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { createLogger } from '../../lib/logger';
import { loadConfig, type AppConfig } from '../../lib/config';
import { retryWithBackoff } from '../../utils/retry';
import { VectorEmbedding } from '../../types/processing.types';

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
  private appConfig: AppConfig;

  constructor() {
    this.appConfig = loadConfig();
    this.searchClient = new SearchClient<ArtworkSearchDocument>(
      this.appConfig.azure.searchEndpoint,
      this.appConfig.azure.searchIndexName,
      new AzureKeyCredential(this.appConfig.azure.searchKey)
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
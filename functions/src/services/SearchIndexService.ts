import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import type { ThumbnailResult, VectorEmbedding } from '@tastematcher/common';
import { createLogger } from '../lib/logger';
import type { Config } from '../lib/config';

const logger = createLogger('SearchIndexService');

interface ArtworkSearchDocument {
  artworkId: string;
  domainId: string;
  thumbnailSmall?: string;
  thumbnailMedium?: string;
  thumbnailLarge?: string;
  imageVector: number[];
  indexedAt: string;
}

interface IndexArtworkInput {
  artworkId: string;
  domainId: string;
  thumbnails: ThumbnailResult[];
  vectorEmbedding: VectorEmbedding;
}

/**
 * Service for indexing artwork data into Azure Cognitive Search
 */
export class SearchIndexService {
  private searchClient: SearchClient<ArtworkSearchDocument>;

  constructor(config: Config) {
    this.searchClient = new SearchClient<ArtworkSearchDocument>(
      config.searchEndpoint,
      config.searchIndexName,
      new AzureKeyCredential(config.searchApiKey)
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
      thumbnailCount: input.thumbnails.length,
    });

    const thumbnailMap = input.thumbnails.reduce((acc, thumb) => {
      acc[thumb.size] = thumb.blobUrl;
      return acc;
    }, {} as Record<string, string>);

    const document: ArtworkSearchDocument = {
      artworkId: input.artworkId,
      domainId: input.domainId,
      thumbnailSmall: thumbnailMap['small'],
      thumbnailMedium: thumbnailMap['medium'],
      thumbnailLarge: thumbnailMap['large'],
      imageVector: input.vectorEmbedding.vector,
      indexedAt: new Date().toISOString(),
    };

    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
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

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        logger.warn({
          msg: 'Index operation failed',
          artworkId: input.artworkId,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : 'Unknown',
          willRetry: !isLastAttempt,
        });

        if (isLastAttempt) {
          throw new Error(
            `Failed to index artwork after ${maxRetries + 1} attempts: ${
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

import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import type { ThumbnailInfo, VectorEmbedding } from '@tastematcher/common';
import { getThumbnailSizeFromDimensions } from '@tastematcher/common';
import { createLogger } from '../../lib/logger';
import type { Config } from '../../lib/config';
import { retryWithBackoff } from '../../utils/retry';

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
  thumbnails: ThumbnailInfo[];
  vectorEmbedding: VectorEmbedding;
}

/**
 * Service for indexing artwork data into Azure Cognitive Search
 */
export class SearchIndexService {
  private searchClient: SearchClient<ArtworkSearchDocument>;

  constructor(config: Config) {
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
      thumbnailCount: input.thumbnails.length,
    });

    const thumbnailMap = input.thumbnails.reduce((acc, thumb) => {
      acc[getThumbnailSizeFromDimensions(thumb.width, thumb.height)] = thumb.url;
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

    retryWithBackoff(() => {
      return this.mergeOrUploadDocument(input, document);
    },
      {
        maxAttempts: 3,
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
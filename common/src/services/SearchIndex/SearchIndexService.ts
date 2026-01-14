import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { createLogger } from "../../lib/logger";
import { loadConfig, type AppConfig } from "../../lib/config";
import { retryWithBackoff } from "../../utils/retry";
import { VectorEmbedding } from "../../types/processing.types";

const logger = createLogger("SearchIndexService");

interface ArtworkSearchDocument {
  artworkId: string; // Unique identifier for the artwork
  domainId: string; // Domain ID to which the artwork belongs
  imageVector: number[]; // 1024-dimension vector for the artwork
  // Ensure all fields are explicitly defined and match the expected structure
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
      new AzureKeyCredential(this.appConfig.azure.searchKey),
    );
  }

  /**
   * Indexes artwork with thumbnails and vector embedding
   * Implements idempotency via upsert operation
   */
  async indexArtwork(input: IndexArtworkInput): Promise<void> {
    logger.debug({
      msg: "Indexing artwork",
      artworkId: input.artworkId,
      domainId: input.domainId,
      vectorDimensions: input.vectorEmbedding.vector.length, // Log actual dimensions
    });

    // Validate vector dimensions
    if (input.vectorEmbedding.vector.length !== 1024) {
      throw new Error(
        `Invalid vector dimensions: expected 1024 (Azure AI Vision), got ${input.vectorEmbedding.vector.length}`,
      );
    }

    const document: ArtworkSearchDocument = {
      artworkId: input.artworkId,
      domainId: input.domainId,
      imageVector: input.vectorEmbedding.vector,
    };

    retryWithBackoff(
      () => {
        return this.mergeOrUploadDocument(input, document);
      },
      {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      },
      input.artworkId,
      logger,
    ).catch((err) => {
      logger.error({
        msg: "Failed to index artwork after retries",
        artworkId: input.artworkId,
        domainId: input.domainId,
        err,
      });
      throw err;
    });
  }

  async mergeOrUploadDocument(
    input: IndexArtworkInput,
    document: ArtworkSearchDocument,
  ): Promise<void> {
    // Use mergeOrUpload for idempotency
    const result = await this.searchClient.mergeOrUploadDocuments([document]);

    const success = result.results.every((r) => r.succeeded);

    if (!success) {
      const errors = result.results
        .filter((r) => !r.succeeded)
        .map((r) => r.errorMessage)
        .join(", ");
      throw new Error(`Index operation failed: ${errors}`);
    }

    logger.info({
      msg: "Artwork indexed successfully",
      artworkId: input.artworkId,
      domainId: input.domainId,
    });

    return;
  }

  /**
   * Search for similar artworks using vector similarity
   * Returns top K most similar artworks for a given user preference vector
   */
  async searchSimilarArtworks(
    domainId: string,
    userVector: number[],
    topK: number = 15,
  ): Promise<Array<{ artworkId: string; score: number }>> {
    logger.debug({
      msg: "Searching similar artworks",
      domainId,
      vectorDimensions: userVector.length,
      topK,
    });

    // Validate vector dimensions
    if (userVector.length !== 1024) {
      throw new Error(
        `Invalid vector dimensions: expected 1024 (Azure AI Vision), got ${userVector.length}`,
      );
    }

    try {
      const searchResults = await this.searchClient.search("*", {
        vectorSearchOptions: {
          queries: [
            {
              kind: "vector",
              vector: userVector,
              kNearestNeighborsCount: topK,
              fields: ["imageVector"],
            },
          ],
        },
        filter: `domainId eq '${domainId}'`,
        top: topK,
        select: ["artworkId"],
      });

      const results: Array<{ artworkId: string; score: number }> = [];

      for await (const result of searchResults.results) {
        results.push({
          artworkId: result.document.artworkId,
          score: result.score ?? 0,
        });
      }

      logger.info({
        msg: "Similar artworks found",
        domainId,
        count: results.length,
      });

      // return sorted results by score descending
      return results.sort((a, b) => b.score - a.score);
    } catch (err) {
      logger.error({
        msg: "Failed to search similar artworks",
        domainId,
        err,
      });
      throw err;
    }
  }

  /**
   * Retrieves the image vector for a given artwork from the search index.
   * Returns the vector array if found, or null if not found.
   */
  async getArtworkVector(artworkId: string): Promise<number[] | null> {
    try {
      const result = await this.searchClient.getDocument(artworkId);
      return result.imageVector;
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.warn({
          msg: "Artwork not found in search index",
          artworkId,
        });
        return null;
      }
      logger.error({
        msg: "Failed to get artwork vector from search index",
        artworkId,
        err,
      });
      throw err;
    }
  }

  /**
   * L2-normalizes the input vector.
   * Returns a new vector with unit length (or all zeros if input is zero vector).
   */
  normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    if (magnitude === 0) {
      return new Array(vector.length).fill(0);
    }
    return vector.map((val) => val / magnitude);
  }

  /**
   * Updates the user's preference vector based on a swipe.
   * If liked=true, moves the vector toward the image vector.
   * If liked=false, moves the vector away from the image vector.
   * Both vectors must be the same length.
   * Returns the new normalized preference vector.
   */
  calculateUpdatedPreferenceVector(
    userVector: number[],
    imageVector: number[],
    liked: boolean,
  ): number[] {
    if (userVector.length !== imageVector.length) {
      throw new Error("Vector dimensions do not match");
    }
    // Move toward or away from the image vector
    const updated = userVector.map((v, i) =>
      liked ? v + imageVector[i] : v - imageVector[i],
    );
    return this.normalizeVector(updated);
  }
}

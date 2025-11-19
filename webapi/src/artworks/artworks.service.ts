import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import {
  Artwork,
  PaginatedResponse,
  QueryParams,
  ArtworkStats,
  UntastedArtworksResponse,
  ArtworkPreference,
  generatePreferenceId,
  CosmosService,
  SearchIndexService,
  executeCosmosQuery,
  getAIRecommendationsEligibility,
  LikedStatus
} from '@tastematcher/common';
import { UpdateArtworkDto } from './dto/update-artwork.dto';
import { SavePreferenceDto } from './dto/save-preference.dto';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);
  private readonly cosmosService: CosmosService;
  private readonly searchIndexService: SearchIndexService;

  constructor() {
    this.cosmosService = new CosmosService();
    this.searchIndexService = new SearchIndexService();
  }

  /**
   * Fetch artworks with generic query parameters using CosmosQueryBuilder
   * If requestedUserId is provided (customer), attach likedStatus per artwork by joining user's preferences.
   */
  async findAll(
    domainId: string,
    queryParams: QueryParams<Artwork>,
    requestedUserId?: string, // optional: if provided will enrich artworks with likedStatus for that user
  ): Promise<PaginatedResponse<Artwork>> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      const result = await executeCosmosQuery<Artwork>(
        container,
        'domainId',
        domainId,
        queryParams,
        { field: 'createdAt', order: 'desc' }
      );

      this.logger.log(`Fetched ${result.items.length} artworks for domain ${domainId}`);

      // If requestedUserId provided, fetch that user's preferences and map them
      if (requestedUserId) {
        try {
          const preferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();

          // Query preferences for this user (partitioned by userId)
          const prefQuery = {
            query: 'SELECT c.artworkId, c.liked FROM c WHERE c.userId = @userId',
            parameters: [{ name: '@userId', value: requestedUserId }],
          };

          const { resources: prefs } = await preferencesContainer.items
            .query(prefQuery, { partitionKey: requestedUserId })
            .fetchAll();

          const prefMap = new Map<string, boolean>();
          for (const p of prefs) {
            if (p && p.artworkId) prefMap.set(p.artworkId, !!p.liked);
          }

          // Attach likedStatus to each artwork
          result.items = result.items.map((art) => {
            const liked = prefMap.has(art.id) ? prefMap.get(art.id) : undefined;

            const artAny = art as Artwork;
            if (liked === undefined) {
              artAny.likedStatus = LikedStatus.NotTasted;
            } else if (liked === true) {
              artAny.likedStatus = LikedStatus.Liked;
            } else {
              artAny.likedStatus = LikedStatus.Disliked;
            }
            return artAny as Artwork;
          });
        } catch (prefErr) {
          this.logger.warn(`Failed to enrich artworks with user preferences for user ${requestedUserId}`, prefErr);
          // continue without likedStatus
        }
      }

      return {
        items: result.items || [],
        continuationToken: result.continuationToken,
        hasMore: result.hasMore,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch artworks for domain ${domainId}`, error);
      throw error;
    }
  }

  /**
   * Get single artwork by ID
   */
  async findOne(domainId: string, artworkId: string): Promise<Artwork> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      const { resource } = await container.item(artworkId, domainId).read();

      if (!resource) {
        throw new NotFoundException(`Artwork ${artworkId} not found`);
      }

      return resource;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch artwork ${artworkId}`, error);
      throw new NotFoundException(`Artwork ${artworkId} not found`);
    }
  }

  /**
   * Update artwork metadata
   */
  async update(
    domainId: string,
    artworkId: string,
    updateDto: UpdateArtworkDto,
  ): Promise<Artwork> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      const { resource: existing } = await container.item(artworkId, domainId).read();

      if (!existing) {
        throw new NotFoundException(`Artwork ${artworkId} not found`);
      }

      const updated = {
        ...existing,
        ...updateDto,
        updatedAt: Date.now(),
      };

      const { resource } = await container.item(artworkId, domainId).replace(updated);

      this.logger.log(`Updated artwork ${artworkId} in domain ${domainId}`);

      return resource;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update artwork ${artworkId}`, error);
      throw error;
    }
  }

  /**
   * Delete artwork
   */
  async remove(domainId: string, artworkId: string): Promise<void> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      await container.item(artworkId, domainId).delete();
      this.logger.log(`Deleted artwork ${artworkId} from domain ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to delete artwork ${artworkId}`, error);
      throw new NotFoundException(`Artwork ${artworkId} not found`);
    }
  }

  /**
   * Get aggregated statistics for artworks in a domain
   * Uses efficient Cosmos DB aggregation queries
   */
  async getStats(domainId: string, userId: string): Promise<ArtworkStats> {
    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const artworkPreferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();

    try {
      // Calculate date 7 days ago (in milliseconds since epoch)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Query 1: Total artworks count
      const totalQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId',
        parameters: [{ name: '@domainId', value: domainId }],
      };

      // Query 2: Total liked artworks (likeCount > 0)
      const swipeQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId and c.userId = @userId',
        parameters: [{ name: '@domainId', value: domainId }, { name: '@userId', value: userId }],
      };

      // Query 3: Recently added (last 7 days)
      const recentQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.createdAt >= @sevenDaysAgo',
        parameters: [
          { name: '@domainId', value: domainId },
          { name: '@sevenDaysAgo', value: sevenDaysAgo },
        ],
      };

      // Execute queries in parallel for better performance
      const [totalResult, swipeResult, recentResult] = await Promise.all([
        artworksContainer.items.query(totalQuery).fetchAll(),
        artworkPreferencesContainer.items.query(swipeQuery).fetchAll(),
        artworksContainer.items.query(recentQuery).fetchAll(),
      ]);

      const stats: ArtworkStats = {
        totalArtworks: totalResult.resources[0] || 0,
        totalSwiped: swipeResult.resources[0] || 0,
        recentlyAdded: recentResult.resources[0] || 0,
      };

      this.logger.log(`Retrieved stats for domain ${domainId}`, stats);

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get stats for domain ${domainId}`, error);
      throw error;
    }
  }

  /**
   * Get artworks that user hasn't tasted yet
   * Uses efficient anti-join pattern with Cosmos DB
   */
  async getUntastedArtworks(
    domainId: string,
    userId: string,
    limit: number = 20,
  ): Promise<UntastedArtworksResponse> {
    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const preferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();

    try {
      // Step 1: Get all artwork IDs the user has already tasted
      const tastedQuery = {
        query: 'SELECT VALUE c.artworkId FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      };

      const { resources: tastedArtworkIds } = await preferencesContainer.items
        .query(tastedQuery, { partitionKey: userId })
        .fetchAll();

      this.logger.debug(`User ${userId} has tasted ${tastedArtworkIds.length} artworks`);

      // Step 2: Query artworks NOT in the tasted list
      let artworksQuery: string;
      const parameters: Array<{ name: string; value: any }> = [
        { name: '@domainId', value: domainId },
        { name: '@limit', value: limit },
      ];

      if (tastedArtworkIds.length === 0) {
        // User hasn't tasted anything yet - return first N artworks
        artworksQuery = `
          SELECT TOP @limit * 
          FROM c 
          WHERE c.domainId = @domainId 
          ORDER BY c.createdAt DESC
        `;
      } else {
        // Exclude already tasted artworks using NOT IN
        // Note: For large lists, consider pagination or alternative patterns
        artworksQuery = `
          SELECT TOP @limit * 
          FROM c 
          WHERE c.domainId = @domainId 
            AND NOT ARRAY_CONTAINS(@tastedIds, c.id)
          ORDER BY c.createdAt DESC
        `;
        parameters.push({ name: '@tastedIds', value: tastedArtworkIds });
      }

      const { resources: untastedArtworks } = await artworksContainer.items
        .query({ query: artworksQuery, parameters })
        .fetchAll();

      this.logger.log(
        `Found ${untastedArtworks.length} untasted artworks for user ${userId} in domain ${domainId}`,
      );

      return {
        artworks: untastedArtworks,
        total: untastedArtworks.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get untasted artworks for user ${userId} in domain ${domainId}`, error);
      throw error;
    }
  }

  /**
   * Save or update artwork preference (like/dislike) for a user
   */
  async savePreference(domainId: string, userId: string, artworkId: string, saveDto: SavePreferenceDto): Promise<ArtworkPreference> {
    const container = await this.cosmosService.getArtworkPreferencesContainer();

    try {
      // Check if preference already exists
      const { resource: existingPreference } = await container.item(artworkId, userId).read();

      const preferenceId = generatePreferenceId(userId, artworkId);

      if (existingPreference) {
        // Update existing preference
        const updatedPreference = {
          ...existingPreference,
          ...saveDto,
          updatedAt: Date.now(),
        };

        const { resource } = await container.item(artworkId, userId).replace(updatedPreference);

        this.logger.log(`Updated preference for artwork ${artworkId} by user ${userId}`);

        return resource;
      } else {
        // Create new preference
        const newPreference = {
          id: preferenceId,
          domainId,
          userId,
          ...saveDto,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const { resource } = await container.items.create(newPreference);

        this.logger.log(`Saved new preference for artwork ${artworkId} by user ${userId}`);

        return resource!;
      }
    } catch (error) {
      this.logger.error(`Failed to save preference for artwork ${artworkId} by user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get recommendations for a user (customer or domain owner scoped)
   */
  async getRecommendationsForUser(
    domainId: string,
    requester: { id: string; role: string },
    targetUserId?: string,
  ): Promise<Array<Artwork>> {
    const resolvedUserId =
      (requester.role === 'dealer' || requester.role === 'domain_owner' || requester.role === 'global_admin') && targetUserId
        ? targetUserId
        : requester.id;

    const start = Date.now();
    this.logger.debug({
      msg: 'Fetching AI suggestions',
      domainId,
      requesterId: requester.id,
      targetUserId: resolvedUserId,
    });

    try {
      const userRecord = await this.cosmosService.getUser(domainId, resolvedUserId);

      const { totalArtworks, totalSwiped, recentlyAdded } = await this.getStats(domainId, resolvedUserId);
      userRecord.swipeCount = totalSwiped;

      const { isEligible, reasons } = getAIRecommendationsEligibility(userRecord);

      if (!isEligible) {
        this.logger.log({
          msg: `User not eligible for AI suggestions: ${reasons.join(', ')}`,
          domainId,
          targetUserId: resolvedUserId,
          durationMs: Date.now() - start,
        });

        throw new BadRequestException(`User not eligible for AI suggestions: ${reasons.join(', ')}`);
      }

      const preferenceVector = Array.isArray(userRecord.preferenceVector)
        ? userRecord.preferenceVector
        : undefined;

      if (!preferenceVector || preferenceVector.length !== 1024) {
        this.logger.warn({
          msg: 'Missing or invalid preference vector; skipping AI suggestions',
          domainId,
          targetUserId: resolvedUserId,
        });

        return [];
      }

      const matches = await this.searchIndexService.searchSimilarArtworks(
        domainId,
        preferenceVector,
        10,
      );

      const artworksContainer = await this.cosmosService.getArtworksContainer();
      const recommendedArtworks: Artwork[] = [];

      for (const match of matches) {
        try {
          const { resource: artwork } = await artworksContainer
            .item(match.artworkId, domainId)
            .read();

          if (artwork) {
            artwork.probabilityMatch = match.score;
            recommendedArtworks.push(artwork);
          }
        } catch (lookupError) {
          this.logger.warn({
            msg: 'Failed to fetch artwork during AI suggestions',
            domainId,
            artworkId: match.artworkId,
            error: (lookupError as Error).message,
          });
        }
      }

      this.logger.log({
        msg: 'AI suggestions generated successfully',
        domainId,
        targetUserId: resolvedUserId,
        recommendationCount: recommendedArtworks.length,
        durationMs: Date.now() - start,
      });

      return recommendedArtworks;

    } catch (error) {
      this.logger.error({
        msg: 'Failed to generate AI suggestions',
        domainId,
        requesterId: requester.id,
        targetUserId: resolvedUserId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }
}

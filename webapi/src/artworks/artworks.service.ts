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
  LikedStatus,
  GlobalArtworksDomainId
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
   * Includes total likes, dislikes, swipes, and recently added artworks.
   */
  async getStats(domainId: string, userId: string): Promise<ArtworkStats> {
    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const preferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();

    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const totalQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId',
        parameters: [{ name: '@domainId', value: domainId }],
      };

      const totalSwipedQuery = {
        query: `
          SELECT VALUE COUNT(1) 
          FROM c 
          WHERE c.userId = @userId AND c.domainId = @domainId
        `,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@domainId', value: GlobalArtworksDomainId },
        ],
      };

      const likesQuery = {
        query: `
          SELECT VALUE COUNT(1) 
          FROM c 
          WHERE c.userId = @userId AND c.domainId = @domainId AND c.liked = true
        `,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@domainId', value: domainId },
        ],
      };

      const dislikesQuery = {
        query: `
          SELECT VALUE COUNT(1) 
          FROM c 
          WHERE c.userId = @userId AND c.domainId = @domainId AND c.liked = false
        `,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@domainId', value: domainId },
        ],
      };

      const recentQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.createdAt >= @sevenDaysAgo',
        parameters: [
          { name: '@domainId', value: domainId },
          { name: '@sevenDaysAgo', value: sevenDaysAgo },
        ],
      };

      const [totalResult, totalSwipedResult, likesResult, dislikesResult, recentResult] = await Promise.all([
        artworksContainer.items.query(totalQuery).fetchAll(),
        preferencesContainer.items.query(totalSwipedQuery).fetchAll(),
        preferencesContainer.items.query(likesQuery).fetchAll(),
        preferencesContainer.items.query(dislikesQuery).fetchAll(),
        artworksContainer.items.query(recentQuery).fetchAll(),
      ]);

      const stats: ArtworkStats = {
        totalArtworks: totalResult.resources[0] || 0,
        totalLikes: likesResult.resources[0] || 0,
        totalDislikes: dislikesResult.resources[0] || 0,
        totalSwiped: totalSwipedResult.resources[0] || 0,
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
    const artworkPreferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();

    try {

      const preferenceId = generatePreferenceId(userId, artworkId);
      let updatedResource;

      // Check if preference already exists
      const { resource: existingPreference } = await artworkPreferencesContainer.item(preferenceId, userId).read();


      if (existingPreference) {
        // Update existing preference
        const updatedPreference = {
          ...existingPreference,
          ...saveDto,
          updatedAt: Date.now(),
        };

        const { resource: updatedResource } = await artworkPreferencesContainer.item(preferenceId, userId).replace(updatedPreference);

        this.logger.log(`Updated preference for artwork ${artworkId} by user ${userId}`);

      } else {
        // Create new preference
        const newPreference = {
          id: preferenceId,
          userId,
          ...saveDto,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const { resource: updatedResource } = await artworkPreferencesContainer.items.create(newPreference);

        this.logger.log(`Saved new preference for artwork ${artworkId} by user ${userId}`);
      }

      // first, get the user preferenceVector from his existing record
      const usersContainer = await this.cosmosService.getContainer('Core');
      const { resource: userRecord } = await usersContainer.item(userId, domainId).read();
      const userPreferenceVector = userRecord.preferenceVector;

      const artworkResource = await this.findOne(saveDto.domainId, artworkId);
      if (!artworkResource) {
        throw new NotFoundException(`Artwork ${artworkId} not found for updating preference vector`);
      }

      const imageVector = artworkResource.vector;

      // if preferenceVector exists and is valid, update it using the new preference
      if (Array.isArray(userPreferenceVector) && userPreferenceVector.length === 1024 &&
        imageVector && imageVector.length === 1024) {
        // Here you would implement the logic to update the user's preference vector
        // based on the new preference. This could involve calling an external service
        // or running a local algorithm to adjust the vector.
        const updatedPreferenceVector = this.searchIndexService.calculateUpdatedPreferenceVector(
          userPreferenceVector,
          imageVector,
          saveDto.liked
        );

        // store updated preference vector back to user record
        userRecord.preferenceVector = updatedPreferenceVector;
        await usersContainer.item(userId, domainId).replace(userRecord);

        this.logger.log(`Updated preference vector for user ${userId} after saving preference for artwork ${artworkId}`);
      }

      return updatedResource!;
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

      this.logger.debug({
        msg: 'Generating AI suggestions using preference vector',
        domainId,
        targetUserId: resolvedUserId,
        preferenceVector: preferenceVector,
      });

      const matches = await this.searchIndexService.searchSimilarArtworks(
        domainId,
        preferenceVector
      );

      const artworksContainer = await this.cosmosService.getArtworksContainer();
      const preferencesContainer = await this.cosmosService.getArtworkPreferencesContainer();
      const recommendedArtworks: Artwork[] = [];

      // Fetch preferences for the user
      const preferencesQuery = {
        query: 'SELECT c.artworkId, c.liked FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: resolvedUserId }],
      };

      const { resources: preferences } = await preferencesContainer.items
        .query(preferencesQuery, { partitionKey: resolvedUserId })
        .fetchAll();

      const preferencesMap = new Map<string, boolean>();
      preferences.forEach((pref) => {
        preferencesMap.set(pref.artworkId, pref.liked);
      });

      for (const match of matches) {
        try {
          const { resource: artwork } = await artworksContainer
            .item(match.artworkId, domainId)
            .read();

          if (artwork) {
            artwork.probabilityMatch = match.score;

            // Attach liked status to the artwork
            const liked = preferencesMap.get(artwork.id);
            if (liked === undefined) {
              artwork.likedStatus = LikedStatus.NotTasted;
            } else if (liked) {
              artwork.likedStatus = LikedStatus.Liked;
            } else {
              artwork.likedStatus = LikedStatus.Disliked;
            }

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
      // return the top 10 recommended artworks. We prefer those with highest probabilityMatch and not yet tasted, but the results will always be 10.
      const topArtworks = recommendedArtworks.slice(0, 10);
      const topArtworksWithoutTasted = recommendedArtworks.filter(art => art.likedStatus === LikedStatus.NotTasted);

      // if topArtworksWithoutTasted has less than 10, fill the rest with tasted artworks that have highest probabilityMatch and not already included
      if (topArtworksWithoutTasted.length < 10) {
        const needed = 10 - topArtworksWithoutTasted.length;
        const tastedArtworks = topArtworks
          .filter(art => art.likedStatus !== LikedStatus.NotTasted)
          .slice(0, needed);

        return [...topArtworksWithoutTasted, ...tastedArtworks].sort((a, b) => (b.probabilityMatch || 0) - (a.probabilityMatch || 0));
      }

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

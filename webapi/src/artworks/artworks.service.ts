import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Artwork, PaginatedResponse, QueryParams, ArtworkStats, UntastedArtworksResponse, ArtworkPreference, generatePreferenceId, CosmosService, executeCosmosQuery, User } from '@tastematcher/common';
import { UpdateArtworkDto } from './dto/update-artwork.dto';
import { SavePreferenceDto } from './dto/save-preference.dto';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);
  private readonly cosmosService: CosmosService;

  constructor() {
    this.cosmosService = new CosmosService();
  }

  /**
   * Fetch artworks with generic query parameters
   */
  async findAll(domainId: string, queryParams: QueryParams<Artwork>): Promise<PaginatedResponse<Artwork>> {
    const container = await this.cosmosService.getContainer('Artworks');

    try {
      const result = await executeCosmosQuery<Artwork>(
        container,
        'domainId',
        domainId,
        queryParams,
        { field: 'createdAt', order: 'desc' }
      );

      this.logger.log(`Fetched ${result.items.length} artworks for domain ${domainId}`);

      return {
        items: result.items,
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
    const container = await this.cosmosService.getContainer('Artworks');

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
    const container = await this.cosmosService.getContainer('Artworks');

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
    const container = await this.cosmosService.getContainer('Artworks');

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
  async getStats(domainId: string): Promise<ArtworkStats> {
    const artworksContainer = await this.cosmosService.getContainer('Artworks');
    const artworksPreferencesContainer = await this.cosmosService.getContainer('ArtworkPreferences');

    try {
      // Calculate date 7 days ago (in milliseconds since epoch)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Query 1: Total artworks count
      const totalQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId',
        parameters: [{ name: '@domainId', value: domainId }],
      };

      // Query 2: Total liked artworks (likeCount > 0)
      const likedQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.liked = true',
        parameters: [{ name: '@domainId', value: domainId }],
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
      const [totalResult, likedResult, recentResult] = await Promise.all([
        artworksContainer.items.query(totalQuery).fetchAll(),
        artworksPreferencesContainer.items.query(likedQuery).fetchAll(),
        artworksContainer.items.query(recentQuery).fetchAll(),
      ]);

      const stats: ArtworkStats = {
        totalArtworks: totalResult.resources[0] || 0,
        totalLiked: likedResult.resources[0] || 0,
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
    const artworksContainer = await this.cosmosService.getContainer('Artworks');
    const preferencesContainer = await this.cosmosService.getContainer('ArtworkPreferences');

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
      this.logger.error(`Failed to get untasted artworks for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Save user preference for an artwork
   * Creates or updates preference in Cosmos DB
   * Also updates the user's taste vector
   */
  async savePreference(
    domainId: string,
    userId: string,
    preferenceDto: SavePreferenceDto,
  ): Promise<ArtworkPreference> {
    const preferencesContainer = await this.cosmosService.getContainer('ArtworkPreferences');
    const usersContainer = await this.cosmosService.getContainer('Users');

    try {
      // Step 1: Fetch the artwork and user in parallel
      const [artwork, user] = await Promise.all([
        this.findOne(domainId, preferenceDto.artworkId) as Promise<Artwork>,
        usersContainer.item(userId, domainId).read().then(res => res.resource) as Promise<User>,
      ]);

      if (!artwork) {
        throw new NotFoundException(`Artwork ${preferenceDto.artworkId} not found`);
      }
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      if (!artwork.vector || !user.preferenceVector) {
        this.logger.warn(`Vector not found for artwork ${artwork.id} or user ${user.id}. Skipping vector update.`);
        throw new NotFoundException(`Vector not found for artwork ${artwork.id} or user ${user.id}. Skipping vector update.`);
      } else {
        // Step 2: Update user's vector
        const learningRate = 0.1; // Configurable learning rate
        const direction = preferenceDto.liked ? 1 : -1;

        const newUserVector = user.preferenceVector.map(
          (val: number, i: number) => val + direction * learningRate * (artwork.vector[i] - val)
        );

        // Step 3: Normalize the new vector
        const normalizedVector = this.normalizeVector(newUserVector);

        // Step 4: Update the user object
        await usersContainer.item(userId, domainId).patch([
          { op: 'replace', path: '/preferenceVector', value: normalizedVector },
          { op: 'replace', path: '/updatedAt', value: Date.now() }
        ]);

        this.logger.log(`Updated vector for user ${userId}`);
      }

      // Step 5: Save the preference
      const preferenceId = generatePreferenceId(userId, preferenceDto.artworkId);

      const preference: ArtworkPreference = {
        id: preferenceId,
        userId,
        artworkId: preferenceDto.artworkId,
        domainId,
        liked: preferenceDto.liked,
        createdAt: Date.now(),
      };

      const { resource } = await preferencesContainer.items.upsert<ArtworkPreference>(preference);

      this.logger.log(
        `Saved preference for user ${userId}, artwork ${preferenceDto.artworkId}: ${preferenceDto.liked ? 'liked' : 'disliked'}`,
      );

      return resource as ArtworkPreference;
    } catch (error) {
      this.logger.error(`Failed to save preference for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Normalizes a vector to a unit vector (length of 1)
   * @param vector The vector to normalize
   * @returns The normalized vector
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
      return vector; // Avoid division by zero
    }
    return vector.map(val => val / magnitude);
  }
}

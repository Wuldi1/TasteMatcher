import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CosmosService } from '../cosmos/cosmos.service';
import { Artwork, PaginatedResponse, QueryParams, ArtworkStats } from '@tastematcher/common';
import { executeCosmosQuery } from '../cosmos/cosmos-query.utils';
import { UpdateArtworkDto } from './dto/update-artwork.dto';
import { LikeArtworkDto } from './dto/like-artwork.dto';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);

  constructor(private readonly cosmosService: CosmosService) {}

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
   * Like or dislike an artwork
   */
  async toggleLike(
    domainId: string,
    artworkId: string,
    likeDto: LikeArtworkDto,
  ): Promise<Artwork> {
    const container = await this.cosmosService.getContainer('Artworks');

    try {
      const { resource: existing } = await container.item(artworkId, domainId).read();
      
      if (!existing) {
        throw new NotFoundException(`Artwork ${artworkId} not found`);
      }

      const updated = {
        ...existing,
        likeCount: likeDto.liked 
          ? (existing.likeCount || 0) + 1 
          : Math.max((existing.likeCount || 0) - 1, 0),
        dislikeCount: !likeDto.liked 
          ? (existing.dislikeCount || 0) + 1 
          : Math.max((existing.dislikeCount || 0) - 1, 0),
        updatedAt: Date.now(),
      };

      const { resource } = await container.item(artworkId, domainId).replace(updated);

      this.logger.log(`Toggled like on artwork ${artworkId}: ${likeDto.liked ? 'liked' : 'disliked'}`);

      return resource;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to toggle like on artwork ${artworkId}`, error);
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
    const container = await this.cosmosService.getContainer('Artworks');

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
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.likeCount > 0',
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
        container.items.query(totalQuery).fetchAll(),
        container.items.query(likedQuery).fetchAll(),
        container.items.query(recentQuery).fetchAll(),
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
}

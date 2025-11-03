import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CosmosService } from '../cosmos/cosmos.service';
import { Artwork, PaginatedResponse, QueryParams } from '@tastematcher/common';
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
}

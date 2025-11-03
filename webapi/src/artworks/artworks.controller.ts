import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ArtworksService } from './artworks.service';
import { UpdateArtworkDto } from './dto/update-artwork.dto';
import { QueryArtworksDto } from './dto/query-artworks.dto';
import { LikeArtworkDto } from './dto/like-artwork.dto';
import { Artwork, PaginatedResponse } from '@tastematcher/common';

@ApiTags('artworks')
@Controller('api/domains/:domainId/artworks')
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ArtworksController {
  constructor(private readonly artworksService: ArtworksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all artworks with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Artworks retrieved successfully' })
  async findAll(
    @Param('domainId') domainId: string,
    @Query() query: QueryArtworksDto,
  ): Promise<PaginatedResponse<Artwork>> {
    return this.artworksService.findAll(domainId, query.toQueryParams());
  }

  @Get(':artworkId')
  @ApiOperation({ summary: 'Get single artwork by ID' })
  @ApiResponse({ status: 200, description: 'Artwork retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async findOne(
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
  ): Promise<Artwork> {
    return this.artworksService.findOne(domainId, artworkId);
  }

  @Patch(':artworkId')
  @ApiOperation({ summary: 'Update artwork metadata' })
  @ApiResponse({ status: 200, description: 'Artwork updated successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async update(
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
    @Body() updateDto: UpdateArtworkDto,
  ): Promise<Artwork> {
    return this.artworksService.update(domainId, artworkId, updateDto);
  }

  @Patch(':artworkId/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like or dislike an artwork' })
  @ApiResponse({ status: 200, description: 'Like status updated successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async toggleLike(
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
    @Body() likeDto: LikeArtworkDto,
  ): Promise<Artwork> {
    return this.artworksService.toggleLike(domainId, artworkId, likeDto);
  }

  @Delete(':artworkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete artwork' })
  @ApiResponse({ status: 204, description: 'Artwork deleted successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async remove(
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
  ): Promise<void> {
    return this.artworksService.remove(domainId, artworkId);
  }
}

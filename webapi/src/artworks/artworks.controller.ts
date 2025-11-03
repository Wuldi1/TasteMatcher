import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
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
import { SavePreferenceDto } from './dto/save-preference.dto';
import { Artwork, PaginatedResponse, ArtworkStats, UntastedArtworksResponse } from '@tastematcher/common';
import { ArtworkPreference } from '@tastematcher/common';

@ApiTags('artworks')
@Controller('api/domains/:domainId/artworks')
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ArtworksController {
  constructor(private readonly artworksService: ArtworksService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregated artwork statistics for domain' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Param('domainId') domainId: string): Promise<ArtworkStats> {
    return this.artworksService.getStats(domainId);
  }

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

  @Get('untasted/:userId')
  @ApiOperation({ summary: 'Get untasted artworks for user (for Taster)' })
  @ApiResponse({ status: 200, description: 'Untasted artworks retrieved successfully' })
  async getUntasted(
    @Param('domainId') domainId: string,
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<UntastedArtworksResponse> {
    return this.artworksService.getUntastedArtworks(domainId, userId, limit || 20);
  }

  @Post('preferences/:userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save user preference for artwork' })
  @ApiResponse({ status: 201, description: 'Preference saved successfully' })
  async savePreference(
    @Param('domainId') domainId: string,
    @Param('userId') userId: string,
    @Body() preferenceDto: SavePreferenceDto,
  ): Promise<ArtworkPreference> {
    return this.artworksService.savePreference(domainId, userId, preferenceDto);
  }
}

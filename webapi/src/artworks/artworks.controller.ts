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
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ArtworksService } from './artworks.service';
import { UpdateArtworkDto } from './dto/update-artwork.dto';
import { QueryArtworksDto } from './dto/query-artworks.dto';
import { SavePreferenceDto } from './dto/save-preference.dto';
import { Artwork, PaginatedResponse, ArtworkStats, UntastedArtworksResponse } from '@tastematcher/common';
import { ArtworkPreference } from '@tastematcher/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request.interface';

@ApiTags('artworks')
@Controller('api/domains/:domainId/artworks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ArtworksController {
  constructor(private readonly artworksService: ArtworksService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregated artwork statistics for domain' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
  ): Promise<ArtworkStats> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.artworksService.getStats(domainId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all artworks with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Artworks retrieved successfully' })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Query() query: QueryArtworksDto,
  ): Promise<PaginatedResponse<Artwork>> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.artworksService.findAll(domainId, query.toQueryParams());
  }

  @Get(':artworkId')
  @ApiOperation({ summary: 'Get single artwork by ID' })
  @ApiResponse({ status: 200, description: 'Artwork retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
  ): Promise<Artwork> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.artworksService.findOne(domainId, artworkId);
  }

  @Patch(':artworkId')
  @ApiOperation({ summary: 'Update artwork metadata' })
  @ApiResponse({ status: 200, description: 'Artwork updated successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
    @Body() updateDto: UpdateArtworkDto,
  ): Promise<Artwork> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.artworksService.update(domainId, artworkId, updateDto);
  }

  @Delete(':artworkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete artwork' })
  @ApiResponse({ status: 204, description: 'Artwork deleted successfully' })
  @ApiResponse({ status: 404, description: 'Artwork not found' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('artworkId') artworkId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.artworksService.remove(domainId, artworkId);
  }

  @Get('untasted/:userId')
  @ApiOperation({ summary: 'Get untasted artworks for user (for Taster)' })
  @ApiResponse({ status: 200, description: 'Untasted artworks retrieved successfully' })
  async getUntasted(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<UntastedArtworksResponse> {
    if (req.user.domainId !== domainId || req.user.id !== userId) {
      throw new ForbiddenException('You are not authorized to perform this action.');
    }
    return this.artworksService.getUntastedArtworks(domainId, userId, limit || 20);
  }

  @Post('preferences/:userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save user preference for artwork' })
  @ApiResponse({ status: 201, description: 'Preference saved successfully' })
  async savePreference(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('userId') userId: string,
    @Body() preferenceDto: SavePreferenceDto,
  ): Promise<ArtworkPreference> {
    if (req.user.domainId !== domainId || req.user.id !== userId) {
      throw new ForbiddenException('You are not authorized to save preferences for this user.');
    }
    return this.artworksService.savePreference(domainId, userId, preferenceDto);
  }
}

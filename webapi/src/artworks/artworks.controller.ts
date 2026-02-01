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
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { ArtworksService } from "./artworks.service";
import { UpdateArtworkDto } from "./dto/update-artwork.dto";
import { SavePreferenceDto } from "./dto/save-preference.dto";
import {
  Artwork,
  ArtworkPreference,
  ArtworkFeedback,
  PaginatedResponse,
  ArtworkStats,
  UntastedArtworksResponse,
  QueryParams,
  GlobalArtworksDomainId,
  cleanupArtworkBeforeResponseToClient,
  Role,
} from "@tastematcher/common";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { Roles } from "../auth/utils/roles.decorator";
import { RolesGuard } from "../auth/utils/roles.guard";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";

@ApiTags("artworks")
@Controller("domains/:domainId/artworks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ArtworksController {
  constructor(private readonly artworksService: ArtworksService) {}

  @Get("stats")
  @ApiOperation({ summary: "Get aggregated artwork statistics for domain" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  async getStats(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
  ): Promise<ArtworkStats> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.artworksService.getStats(domainId, req.user.id);
  }

  @Get("recommendations")
  @ApiOperation({ summary: "Get AI suggestions for a user within the domain" })
  @ApiResponse({
    status: 200,
    description: "AI suggestions retrieved successfully",
  })
  async getRecommendations(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Query("userId") targetUserId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<Array<Artwork>> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }

    const isDomainOwner =
      req.user.role === "dealer" ||
      req.user.role === "domain_owner" ||
      req.user.role === "global_admin";

    if (!isDomainOwner && targetUserId && targetUserId !== req.user.id) {
      throw new ForbiddenException(
        "Customers cannot request suggestions for other users.",
      );
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const recommendedArtworks =
      await this.artworksService.getRecommendationsForUser(
        domainId,
        req.user,
        targetUserId,
        limitNum,
        offsetNum,
      );
    return recommendedArtworks.map(
      (artwork) =>
        cleanupArtworkBeforeResponseToClient(artwork, req.user.role) as Artwork,
    );
  }

  @Get()
  @ApiOperation({ summary: "Get all artworks with pagination and filtering" })
  @ApiResponse({ status: 200, description: "Artworks retrieved successfully" })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Query("limit") limit?: string,
    @Query("continuationToken") continuationToken?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: "asc" | "desc",
    @Query("filterBy") filterBy?: string,
    @Query("searchQuery") searchQuery?: string,
    @Query("includeEndedAuctions") includeEndedAuctions?: string,
    @Query("userId") userId?: string, // optional user target for dealer/domain_owner
    @Query("preference") preference?: "liked" | "disliked",
  ): Promise<PaginatedResponse<Artwork>> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }

    // Convert simple query params to QueryParams format
    const queryParams: QueryParams<Artwork> = {
      limit: limit ? parseInt(limit, 10) : 20,
      continuationToken: continuationToken || undefined,
      sort: sortBy
        ? {
            field: sortBy as keyof Artwork,
            order: sortOrder || "desc",
          }
        : undefined,
      filters: filterBy ? [this.parseFilterBy(filterBy)] : undefined,
      search: searchQuery
        ? {
            query: searchQuery,
            fields: ["title", "artist", "description"],
          }
        : undefined,
    };

    // Determine requesterId used to compute likedStatus / preference per-artwork
    let requesterId: string | undefined;

    // If the caller is a customer, they can only request their own data
    if (req.user.role === "customer") {
      requesterId = req.user.id;
    } else if (userId) {
      // If caller provided userId and is domain owner / global admin allow
      // Allow dealers for now — TODO: verify dealer invited the target user before allowing
      if (
        req.user.role === "domain_owner" ||
        req.user.role === "global_admin" ||
        req.user.role === "dealer"
      ) {
        requesterId = userId;
      } else {
        // other roles are not allowed to request other user's view
        throw new ForbiddenException(
          "You are not authorized to request artworks for another user.",
        );
      }
    } else {
      // no requesterId provided and caller not a customer -> undefined
      requesterId = undefined;
    }

    const normalizedPreference =
      preference === "liked"
        ? "liked"
        : preference === "disliked"
          ? "disliked"
          : undefined;
    const includeEndedAuctionsFlag =
      includeEndedAuctions === "true" || includeEndedAuctions === "1";
    const hideEndedAuctions =
      includeEndedAuctions !== undefined ? !includeEndedAuctionsFlag : false;

    if (normalizedPreference && !requesterId) {
      throw new BadRequestException(
        "Preference filters require a specific user context.",
      );
    }

    const viewerContext = {
      id: req.user.id,
      role: req.user.role as Role,
      invitedBy: (req.user as any).invitedBy ?? null,
    };

    let artworks: PaginatedResponse<Artwork>;
    if (normalizedPreference && requesterId) {
      artworks = await this.artworksService.findByPreference(
        domainId,
        requesterId,
        normalizedPreference === "liked",
        queryParams,
        viewerContext,
        hideEndedAuctions,
      );
    } else {
      artworks = await this.artworksService.findAll(
        domainId,
        queryParams,
        requesterId,
        viewerContext,
        hideEndedAuctions,
      );
    }
    return {
      ...artworks,
      items: artworks.items.map(
        (artwork) =>
          cleanupArtworkBeforeResponseToClient(
            artwork,
            req.user.role,
          ) as Artwork,
      ),
    };
  }

  /**
   * Parse filterBy string format "field:value" into FilterCondition
   * Uses case-insensitive contains for flexible matching
   */
  private parseFilterBy(filterBy: string) {
    const [field, value] = filterBy.split(":");
    if (!field || !value) {
      throw new BadRequestException(
        'Invalid filterBy format. Expected "field:value"',
      );
    }

    // Use contains operator for flexible, case-insensitive matching
    return {
      field: field as keyof Artwork,
      operator: "contains" as const,
      value: value,
    };
  }

  @Get(":artworkId")
  @ApiOperation({ summary: "Get single artwork by ID" })
  @ApiResponse({ status: 200, description: "Artwork retrieved successfully" })
  @ApiResponse({ status: 404, description: "Artwork not found" })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
  ): Promise<Artwork> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    const artwork = await this.artworksService.findOne(domainId, artworkId);
    return cleanupArtworkBeforeResponseToClient(
      artwork,
      req.user.role,
    ) as Artwork;
  }

  @Get(":artworkId/feedback")
  @Roles("global_admin", "domain_owner", "dealer")
  @ApiOperation({ summary: "Get feedback for a specific artwork" })
  @ApiResponse({ status: 200, description: "Artwork feedback retrieved" })
  async getArtworkFeedback(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
  ): Promise<ArtworkFeedback> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.artworksService.getArtworkFeedback(domainId, artworkId);
  }

  @Patch(":artworkId")
  @ApiOperation({ summary: "Update artwork metadata" })
  @ApiResponse({ status: 200, description: "Artwork updated successfully" })
  @ApiResponse({ status: 404, description: "Artwork not found" })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
    @Body() updateDto: UpdateArtworkDto,
  ): Promise<Artwork> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    const updatedArtwork = await this.artworksService.update(
      domainId,
      artworkId,
      updateDto,
      req.user,
    );
    return cleanupArtworkBeforeResponseToClient(
      updatedArtwork,
      req.user.role,
    ) as Artwork;
  }

  @Delete(":artworkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete artwork" })
  @ApiResponse({ status: 204, description: "Artwork deleted successfully" })
  @ApiResponse({ status: 404, description: "Artwork not found" })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    await this.artworksService.remove(domainId, artworkId);
  }

  @Get("untasted/:userId")
  @ApiOperation({ summary: "Get untasted artworks for user (for Taster)" })
  @ApiResponse({
    status: 200,
    description: "Untasted artworks retrieved successfully",
  })
  async getUntasted(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("userId") userId: string,
    @Query("limit") limit?: number,
  ): Promise<UntastedArtworksResponse> {
    if (req.user.id !== userId && req.user.role === "customer") {
      throw new ForbiddenException(
        "You are not authorized to perform this action.",
      );
    }
    const includeDomainId =
      domainId !== GlobalArtworksDomainId ? domainId : undefined;
    const viewerContext = {
      id: req.user.id,
      role: req.user.role as Role,
      invitedBy: (req.user as any).invitedBy ?? null,
    };
    const untastedArtworks = await this.artworksService.getUntastedArtworks(
      GlobalArtworksDomainId,
      userId,
      limit || 20,
      includeDomainId,
      viewerContext,
    );
    return {
      ...untastedArtworks,
      artworks: untastedArtworks.artworks.map(
        (artwork) =>
          cleanupArtworkBeforeResponseToClient(
            artwork,
            req.user.role,
          ) as Artwork,
      ),
    };
  }

  @Post("preferences/:userId")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Save user preference for artwork" })
  @ApiResponse({ status: 201, description: "Preference saved successfully" })
  async savePreference(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("userId") userId: string,
    @Body() preferenceDto: SavePreferenceDto,
  ): Promise<ArtworkPreference> {
    if (
      (req.user.domainId !== domainId && domainId !== GlobalArtworksDomainId) ||
      req.user.id !== userId
    ) {
      throw new ForbiddenException(
        "You are not authorized to save preferences for this user.",
      );
    }
    return this.artworksService.savePreference(
      domainId,
      userId,
      preferenceDto.artworkId,
      preferenceDto,
    );
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  Query,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UsersService } from "./users.service";
import { InviteUserDto } from "./dto/invite-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateQuestionnaireDto } from "./dto/update-questionnaire.dto";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { RolesGuard } from "../auth/utils/roles.guard";
import { Roles } from "../auth/utils/roles.decorator";
import { User, UserStatsResponse } from "@tastematcher/common";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { AuthService } from "../auth/auth.service";
import { ArtworksService } from "../artworks/artworks.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly artworksService: ArtworksService,
  ) {}

  /**
   * Get all users in the current domain (domain_owner and global_admin only)
   */
  @Get()
  @Roles("domain_owner", "global_admin", "dealer")
  async findAll(@Request() req: AuthenticatedRequest): Promise<User[]> {
    return this.usersService.findAllInDomain(req.user.domainId, req.user, true);
  }

  /**
   * Get all users in a specific domain (global_admin only)
   */
  @Get("domain/:domainId")
  @Roles("global_admin")
  async findAllInSpecificDomain(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
  ): Promise<User[]> {
    return this.usersService.findAllInDomain(domainId, req.user, true);
  }

  /**
   * Get aggregated stats for the current user
   */
  @Get("stats")
  async getUserStats(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserStatsResponse> {
    const { id: userId, domainId } = req.user;

    // Fetch swiping stats
    const stats = await this.artworksService.getStats(domainId, userId);

    // Return only necessary data
    return {
      ...stats,
      // TODO : TBD
    };
  }

  /**
   * Get a specific user by ID (domain_owner and global_admin only)
   */
  @Get(":id")
  @Roles("dealer", "domain_owner", "global_admin")
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param("id") userId: string,
    @Query("domainId") domainId?: string,
  ): Promise<User> {
    if (
      domainId &&
      req.user.domainId !== domainId &&
      req.user.role !== "global_admin"
    ) {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.usersService.findOne(domainId ?? req.user.domainId, userId);
  }

  /**
   * Update a user (domain_owner and global_admin only)
   */
  @Patch(":id")
  @Roles("domain_owner", "global_admin")
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") userId: string,
    @Body() updateDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(
      req.user.domainId,
      userId,
      updateDto,
      req.user.id,
    );
  }

  /**
   * Add a comment to a user (chat)
   */
  @Post(":id/comments")
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @Request() req: AuthenticatedRequest,
    @Param("id") userId: string,
    @Body("text") text: string,
  ): Promise<User> {
    if (!text) {
      throw new BadRequestException("Comment text is required");
    }

    // Allow user to comment on themselves, or dealers/admins to comment on users in their domain
    if (req.user.id !== userId) {
      if (req.user.role === "customer") {
        throw new ForbiddenException(
          "You can only comment on your own profile.",
        );
      }
      // For dealers/admins, domain check is handled in service or by finding user in domain
    }

    return this.usersService.addComment(
      req.user.domainId,
      userId,
      text,
      req.user,
    );
  }

  /**
   * Delete a user and all their preferences (domain_owner and global_admin only)
   */
  @Delete(":id")
  @Roles("domain_owner", "global_admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param("id") userId: string,
  ): Promise<void> {
    return this.usersService.remove(req.user.domainId, userId, req.user.id);
  }

  /**
   * Invite a new user to the domain (domain_owner and global_admin only)
   */
  @Post("invite")
  @Roles("domain_owner", "global_admin", "dealer")
  async invite(
    @Request() req: AuthenticatedRequest,
    @Body() inviteDto: InviteUserDto,
  ): Promise<User> {
    const currentUser = req.user as User;

    if (currentUser.role === "dealer" && inviteDto.role !== "customer") {
      throw new ForbiddenException("Dealers can only invite customers.");
    }

    return this.usersService.inviteUser(
      req.user.domainId,
      inviteDto,
      req.user.id,
    );
  }

  /**
   * Update current user's questionnaire
   */
  @Patch("me/questionnaire")
  async updateQuestionnaire(
    @Request() req: AuthenticatedRequest,
    @Body() questionnaireDto: UpdateQuestionnaireDto,
  ): Promise<User> {
    return this.usersService.updateQuestionnaire(
      req.user.id,
      req.user.domainId,
      questionnaireDto,
    );
  }

  /**
   * Complete current user's onboarding
   */
  @Post("me/complete-onboarding")
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @Request() req: AuthenticatedRequest,
  ): Promise<User> {
    return this.usersService.completeOnboarding(req.user.id, req.user.domainId);
  }

  /**
   * Skip current user's onboarding (can be resumed later)
   */
  @Post("me/skip-onboarding")
  @HttpCode(HttpStatus.OK)
  async skipOnboarding(@Request() req: AuthenticatedRequest): Promise<User> {
    return this.usersService.skipOnboarding(req.user.id, req.user.domainId);
  }

  /**
   * Upload a single preference image and vectorize it
   * Call this endpoint multiple times for multiple images
   */
  @Post("me/vectorize-preference-image")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  async vectorizePreferenceImage(
    @Request() req: AuthenticatedRequest,
    // eslint-disable-next-line
    @UploadedFile() file: Express.Multer.File,
    @Query("section") section?: "aesthetic" | "collection" | "shared_gallery",
  ): Promise<{ success: boolean; message: string; vectorized: number }> {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    return this.usersService.vectorizePreferenceImage(
      req.user.id,
      req.user.domainId,
      file,
      section,
    );
  }

  /**
   * Complete preference image vectorization
   * Call this after uploading all preference images
   */
  @Post("me/finalize-preference-vectors")
  @HttpCode(HttpStatus.OK)
  async finalizePreferenceVectors(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string; totalVectors: number }> {
    return this.usersService.finalizePreferenceVectors(
      req.user.id,
      req.user.domainId,
    );
  }

  /**
   * Get current user with refreshed JWT token
   */
  @Get("me/refresh")
  async refreshCurrentUser(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ user: User; token: string }> {
    const user = await this.usersService.findOne(
      req.user.domainId,
      req.user.id,
      true,
    );
    const token = this.authService.generateUserToken(user);

    return { user, token };
  }
}

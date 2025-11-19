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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateQuestionnaireDto } from './dto/update-questionnaire.dto';
import { JwtAuthGuard } from '../auth/utils/jwt-auth.guard';
import { RolesGuard } from '../auth/utils/roles.guard';
import { Roles } from '../auth/utils/roles.decorator';
import { User } from '@tastematcher/common';
import { AuthenticatedRequest } from '../auth/types/authenticated-request.interface';
import { AuthService } from '../auth/auth.service';
import { ArtworksService } from '../artworks/artworks.service';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly artworksService: ArtworksService) { }

  /**
   * Get all users in the current domain (domain_owner and global_admin only)
   */
  @Get()
  @Roles('domain_owner', 'global_admin', 'dealer')
  async findAll(@Request() req: AuthenticatedRequest): Promise<User[]> {
    return this.usersService.findAllInDomain(req.user.domainId, req.user, true);
  }

  /**
   * Get all users in a specific domain (global_admin only)
   */
  @Get('domain/:domainId')
  @Roles('global_admin')
  async findAllInSpecificDomain(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
  ): Promise<User[]> {
    return this.usersService.findAllInDomain(domainId, req.user, true);
  }

  /**
   * Get a specific user by ID (domain_owner and global_admin only)
   */
  @Get(':id')
  @Roles('dealer', 'domain_owner', 'global_admin')
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') userId: string,
    @Query('domainId') domainId?: string): Promise<User> {
      if (domainId && req.user.domainId !== domainId && req.user.role !== 'global_admin') {
        throw new ForbiddenException('You are not authorized to access this domain.');
      }
    return this.usersService.findOne(domainId ?? req.user.domainId, userId);
  }

  /**
   * Update a user (domain_owner and global_admin only)
   */
  @Patch(':id')
  @Roles('domain_owner', 'global_admin')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() updateDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(req.user.domainId, userId, updateDto, req.user.id);
  }

  /**
   * Delete a user and all their preferences (domain_owner and global_admin only)
   */
  @Delete(':id')
  @Roles('domain_owner', 'global_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Request() req: AuthenticatedRequest, @Param('id') userId: string): Promise<void> {
    return this.usersService.remove(req.user.domainId, userId, req.user.id);
  }

  /**
   * Invite a new user to the domain (domain_owner and global_admin only)
   */
  @Post('invite')
  @Roles('domain_owner', 'global_admin', 'dealer') // Add dealer role
  async invite(@Request() req: AuthenticatedRequest, @Body() inviteDto: InviteUserDto): Promise<User> {
    const currentUser = req.user as User;

    if (currentUser.role === 'dealer' && inviteDto.role !== 'customer') {
      throw new ForbiddenException('Dealers can only invite customers.');
    }

    return this.usersService.inviteUser(req.user.domainId, inviteDto, req.user.id);
  }

  /**
   * Update current user's questionnaire
   */
  @Patch('me/questionnaire')
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
  @Post('me/complete-onboarding')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(@Request() req: AuthenticatedRequest): Promise<User> {
    return this.usersService.completeOnboarding(req.user.id, req.user.domainId);
  }

  /**
   * Skip current user's onboarding (can be resumed later)
   */
  @Post('me/skip-onboarding')
  @HttpCode(HttpStatus.OK)
  async skipOnboarding(@Request() req: AuthenticatedRequest): Promise<User> {
    return this.usersService.skipOnboarding(req.user.id, req.user.domainId);
  }

  /**
   * Upload a single preference image and vectorize it
   * Call this endpoint multiple times for multiple images
   */
  @Post('me/vectorize-preference-image')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async vectorizePreferenceImage(
    @Request() req: AuthenticatedRequest,
    // eslint-disable-next-line
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean; message: string; vectorized: number }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.usersService.vectorizePreferenceImage(
      req.user.id,
      req.user.domainId,
      file,
    );
  }

  /**
   * Complete preference image vectorization
   * Call this after uploading all preference images
   */
  @Post('me/finalize-preference-vectors')
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
  @Get('me/refresh')
  async refreshCurrentUser(@Request() req: AuthenticatedRequest): Promise<{ user: User; token: string }> {
    const user = await this.usersService.findOne(req.user.domainId, req.user.id, true);
    const token = this.authService.generateUserToken(user);

    return { user, token };
  }
}

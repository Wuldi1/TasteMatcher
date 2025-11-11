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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/utils/jwt-auth.guard';
import { RolesGuard } from '../auth/utils/roles.guard';
import { Roles } from '../auth/utils/roles.decorator';
import { User } from '@tastematcher/common';
import { AuthenticatedRequest } from '../auth/types/authenticated-request.interface';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get all users in the current domain (domain_owner and global_admin only)
   */
  @Get()
  @Roles('domain_owner', 'global_admin')
  async findAll(@Request() req: AuthenticatedRequest): Promise<User[]> {
    return this.usersService.findAllInDomain(req.user.domainId);
  }

  /**
   * Get all users in a specific domain (global_admin only)
   */
  @Get('domain/:domainId')
  @Roles('global_admin')
  async findAllInSpecificDomain(
    @Param('domainId') domainId: string,
  ): Promise<User[]> {
    return this.usersService.findAllInDomain(domainId);
  }

  /**
   * Get a specific user by ID (domain_owner and global_admin only)
   */
  @Get(':id')
  @Roles('domain_owner', 'global_admin')
  async findOne(@Request() req: AuthenticatedRequest, @Param('id') userId: string): Promise<User> {
    return this.usersService.findOne(req.user.domainId, userId);
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
  @Roles('domain_owner', 'global_admin')
  async invite(@Request() req: AuthenticatedRequest, @Body() inviteDto: InviteUserDto): Promise<User> {
    return this.usersService.inviteUser(req.user.domainId, inviteDto, req.user.id);
  }
}

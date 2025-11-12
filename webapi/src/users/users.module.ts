import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { ArtworksModule } from '../artworks/artworks.module';
import { ArtworksService } from '../artworks/artworks.service';

/**
 * Users module for user management operations
 * Provides endpoints for domain owners to manage users
 */
@Module({
  imports: [EmailModule, AuthModule, ArtworksModule],
  controllers: [UsersController],
  providers: [UsersService, AuthService, ArtworksService],
  exports: [UsersService],
})
export class UsersModule {}

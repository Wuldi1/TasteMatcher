import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';

/**
 * Users module for user management operations
 * Provides endpoints for domain owners to manage users
 */
@Module({
  imports: [EmailModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AuthService],
  exports: [UsersService],
})
export class UsersModule {}

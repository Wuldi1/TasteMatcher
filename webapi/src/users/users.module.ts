import { Module, forwardRef } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { EmailModule } from "../email/email.module";
import { AuthModule } from "../auth/auth.module";
import { ArtworksModule } from "../artworks/artworks.module";
import { ActivityModule } from "../activity/activity.module";

/**
 * Users module for user management operations
 * Provides endpoints for domain owners to manage users
 */
@Module({
  imports: [EmailModule, forwardRef(() => AuthModule), ArtworksModule, ActivityModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

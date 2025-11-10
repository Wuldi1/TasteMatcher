import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DomainsModule } from './domains/domains.module';
import { UploadModule } from './upload/upload.module';
import { ArtworksModule } from './artworks/artworks.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module'; // Import the new AuthModule
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
    AuthModule, // Add AuthModule here
    DomainsModule,
    UploadModule,
    ArtworksModule,
    HealthModule,
    UsersModule,
    EmailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
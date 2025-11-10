import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DomainsModule } from './domains/domains.module';
import { UploadModule } from './upload/upload.module';
import { ArtworksModule } from './artworks/artworks.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
    DomainsModule,
    UploadModule,
    ArtworksModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
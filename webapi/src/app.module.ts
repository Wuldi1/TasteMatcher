import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CosmosModule } from './cosmos/cosmos.module';
import { DomainsModule } from './domains/domains.module';
import { UploadModule } from './upload/upload.module';
import { ArtworksModule } from './artworks/artworks.module';
import { BlobModule } from './blob/blob.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
    CosmosModule,
    DomainsModule,
    UploadModule,
    ArtworksModule,
    BlobModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CosmosModule } from '../cosmos/cosmos.module';
import { BlobModule } from '../blob/blob.module';

@Module({
  imports: [CosmosModule, BlobModule],
  controllers: [HealthController],
})
export class HealthModule {}
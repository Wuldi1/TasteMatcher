import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { CosmosModule } from '../cosmos/cosmos.module';

@Module({
  imports: [CosmosModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}

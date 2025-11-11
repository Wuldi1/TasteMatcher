import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { EmailModule } from '../email/email.module';

/**
 * Domains module for domain management operations
 * Provides endpoints for global admins to manage domains
 */
@Module({
  imports: [EmailModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}

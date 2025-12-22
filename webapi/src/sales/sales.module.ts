import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { DomainsModule } from '../domains/domains.module';

@Module({
  imports: [UsersModule, EmailModule, DomainsModule],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}

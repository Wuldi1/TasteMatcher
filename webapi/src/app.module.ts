import { Module } from '@nestjs/common';
import { DomainsModule } from './domains/domains.module';
import { UploadModule } from './upload/upload.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    DomainsModule,
    UploadModule,
    PrismaModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
// webapi/src/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { CosmosModule } from '../cosmos/cosmos.module';
import { BlobModule } from '../blob/blob.module';

@Module({
  imports: [BlobModule, CosmosModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
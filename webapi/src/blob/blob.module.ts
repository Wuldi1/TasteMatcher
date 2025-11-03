import { Module } from '@nestjs/common';
import { BlobService } from './blob.service';

@Module({
  providers: [BlobService],
  exports: [BlobService],
})
export class BlobModule {}

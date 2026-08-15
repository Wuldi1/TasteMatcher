// webapi/src/upload/upload.module.ts
import { Module } from "@nestjs/common";
import {
  BlobService,
  CosmosService,
  VectorizationService,
} from "@tastematcher/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";

@Module({
  controllers: [UploadController],
  providers: [
    {
      provide: UploadService,
      useFactory: () =>
        new UploadService(
          new BlobService(),
          new CosmosService(),
          new VectorizationService(),
        ),
    },
  ],
  exports: [UploadService],
})
export class UploadModule {}

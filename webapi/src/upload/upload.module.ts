// webapi/src/upload/upload.module.ts
import { Module } from "@nestjs/common";
import {
  BlobService,
  CosmosService,
  VectorizationService,
} from "@tastematcher/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { ActivityModule } from "../activity/activity.module";
import { ProductActivityLoggerService } from "../activity/product-activity-logger.service";

@Module({
  imports: [ActivityModule],
  controllers: [UploadController],
  providers: [
    {
      provide: UploadService,
      useFactory: (productActivityLogger: ProductActivityLoggerService) =>
        new UploadService(
          new BlobService(),
          new CosmosService(),
          new VectorizationService(),
          productActivityLogger,
        ),
      inject: [ProductActivityLoggerService],
    },
  ],
  exports: [UploadService],
})
export class UploadModule {}

import { Module } from "@nestjs/common";
import { DomainActivityService } from "./domain-activity.service";
import { ProductActivityLoggerService } from "./product-activity-logger.service";

@Module({
  providers: [DomainActivityService, ProductActivityLoggerService],
  exports: [DomainActivityService, ProductActivityLoggerService],
})
export class ActivityModule {}

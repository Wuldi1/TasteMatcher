import { Module } from "@nestjs/common";
import { DomainActivityService } from "./domain-activity.service";

@Module({
  providers: [DomainActivityService],
  exports: [DomainActivityService],
})
export class ActivityModule {}

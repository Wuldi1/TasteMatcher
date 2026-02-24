import { Module } from "@nestjs/common";
import { ArtworksController } from "./artworks.controller";
import { ArtworksService } from "./artworks.service";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  controllers: [ArtworksController],
  providers: [ArtworksService],
  exports: [ArtworksService],
})
export class ArtworksModule {}

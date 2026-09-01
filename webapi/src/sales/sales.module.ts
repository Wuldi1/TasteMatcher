import { Module } from "@nestjs/common";
import { SalesService } from "./sales.service";
import { SalesController } from "./sales.controller";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../email/email.module";
import { DomainsModule } from "../domains/domains.module";
import { ActivityModule } from "../activity/activity.module";
import { ArtworksModule } from "../artworks/artworks.module";

@Module({
  imports: [
    UsersModule,
    EmailModule,
    DomainsModule,
    ActivityModule,
    ArtworksModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}

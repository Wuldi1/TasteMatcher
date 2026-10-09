import { Module } from "@nestjs/common";
import { UploadModule } from "../upload/upload.module";
import { AutomaticUploadsController } from "./automatic-uploads.controller";
import { AutomaticUploadsService } from "./automatic-uploads.service";
import {
  AUTOMATIC_UPLOAD_PROVIDER_ADAPTERS,
  AutomaticUploadProviderRegistry,
} from "./providers/automatic-upload-provider.registry";
import { PhillipsProvider } from "./providers/phillips.provider";
import { SafeRemoteFetcher } from "./safe-remote-fetcher";
import { ActivityModule } from "../activity/activity.module";
import { BlobService, CosmosService } from "@tastematcher/common";
import {
  AutomaticUploadPdfIntakesController,
  AutomaticUploadPdfIntakesInternalController,
} from "./automatic-upload-pdf-intakes.controller";
import { AutomaticUploadPdfIntakesService } from "./automatic-upload-pdf-intakes.service";

@Module({
  imports: [UploadModule, ActivityModule],
  controllers: [
    AutomaticUploadsController,
    AutomaticUploadPdfIntakesController,
    AutomaticUploadPdfIntakesInternalController,
  ],
  providers: [
    AutomaticUploadsService,
    {
      provide: AutomaticUploadPdfIntakesService,
      useFactory: (automaticUploads: AutomaticUploadsService) =>
        new AutomaticUploadPdfIntakesService(
          automaticUploads,
          new BlobService(),
          new CosmosService(),
        ),
      inject: [AutomaticUploadsService],
    },
    PhillipsProvider,
    AutomaticUploadProviderRegistry,
    {
      provide: AUTOMATIC_UPLOAD_PROVIDER_ADAPTERS,
      useFactory: (phillipsProvider: PhillipsProvider) => [phillipsProvider],
      inject: [PhillipsProvider],
    },
    {
      provide: SafeRemoteFetcher,
      useFactory: () => new SafeRemoteFetcher(),
    },
  ],
})
export class AutomaticUploadsModule {}

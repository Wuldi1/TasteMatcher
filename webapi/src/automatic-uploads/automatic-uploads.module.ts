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

@Module({
  imports: [UploadModule],
  controllers: [AutomaticUploadsController],
  providers: [
    AutomaticUploadsService,
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

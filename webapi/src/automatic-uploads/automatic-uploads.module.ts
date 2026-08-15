import { Module } from "@nestjs/common";
import { UploadModule } from "../upload/upload.module";
import { AutomaticUploadsController } from "./automatic-uploads.controller";
import { AutomaticUploadsService } from "./automatic-uploads.service";
import { PhillipsProvider } from "./providers/phillips.provider";
import { SafeRemoteFetcher } from "./safe-remote-fetcher";

@Module({
  imports: [UploadModule],
  controllers: [AutomaticUploadsController],
  providers: [
    AutomaticUploadsService,
    PhillipsProvider,
    {
      provide: SafeRemoteFetcher,
      useFactory: () => new SafeRemoteFetcher(),
    },
  ],
})
export class AutomaticUploadsModule {}

import { Inject, Injectable } from "@nestjs/common";
import { AutomaticUploadProvider } from "@tastematcher/common";
import { AutomaticUploadProviderAdapter } from "./automatic-upload-provider.interface";

export const AUTOMATIC_UPLOAD_PROVIDER_ADAPTERS = Symbol(
  "AUTOMATIC_UPLOAD_PROVIDER_ADAPTERS",
);

/** Resolves provider-specific parsing from the submitted auction URL. */
@Injectable()
export class AutomaticUploadProviderRegistry {
  constructor(
    @Inject(AUTOMATIC_UPLOAD_PROVIDER_ADAPTERS)
    private readonly adapters: readonly AutomaticUploadProviderAdapter[],
  ) {}

  findForUrl(url: URL): AutomaticUploadProviderAdapter | undefined {
    return this.adapters.find((adapter) => adapter.canParse(url));
  }

  findByProvider(
    provider: AutomaticUploadProvider,
  ): AutomaticUploadProviderAdapter | undefined {
    return this.adapters.find((adapter) => adapter.provider === provider);
  }
}

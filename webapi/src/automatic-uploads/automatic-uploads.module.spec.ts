import { MODULE_METADATA } from "@nestjs/common/constants";
import { AutomaticUploadsModule } from "./automatic-uploads.module";
import { SafeRemoteFetcher } from "./safe-remote-fetcher";

interface FactoryProvider {
  provide: unknown;
  useFactory: () => unknown;
}

function isFactoryProvider(value: unknown): value is FactoryProvider {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return "provide" in record && typeof record.useFactory === "function";
}

describe("AutomaticUploadsModule", () => {
  it("constructs SafeRemoteFetcher through an explicit factory", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AutomaticUploadsModule,
    ) as unknown[];
    const fetcherProvider = providers.find(
      (provider) =>
        isFactoryProvider(provider) && provider.provide === SafeRemoteFetcher,
    );

    expect(isFactoryProvider(fetcherProvider)).toBe(true);
    if (!isFactoryProvider(fetcherProvider)) return;
    expect(fetcherProvider.useFactory()).toBeInstanceOf(SafeRemoteFetcher);
  });
});

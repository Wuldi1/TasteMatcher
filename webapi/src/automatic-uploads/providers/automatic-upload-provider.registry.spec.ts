import { AutomaticUploadProviderAdapter } from "./automatic-upload-provider.interface";
import { AutomaticUploadProviderRegistry } from "./automatic-upload-provider.registry";

describe("AutomaticUploadProviderRegistry", () => {
  const provider: AutomaticUploadProviderAdapter = {
    provider: "phillips",
    displayName: "Phillips",
    canParse: (url) => url.hostname === "www.phillips.com",
    parse: jest.fn(),
  };
  const registry = new AutomaticUploadProviderRegistry([provider]);

  it("selects the parser from the submitted URL", () => {
    expect(
      registry.findForUrl(
        new URL("https://www.phillips.com/auction/NY030826"),
      ),
    ).toBe(provider);
    expect(registry.findByProvider("phillips")).toBe(provider);
  });

  it("returns no parser for an unsupported domain", () => {
    expect(
      registry.findForUrl(new URL("https://www.sothebys.com/auction/example")),
    ).toBeUndefined();
  });
});

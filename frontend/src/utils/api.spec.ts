import { resolveApiBaseUrl } from "./api";

describe("resolveApiBaseUrl", () => {
  it.each(["localhost", "127.0.0.1"])(
    "keeps local host %s on the local API even when another URL is configured",
    (hostname) => {
      expect(
        resolveApiBaseUrl(hostname, "https://api.tastematcher.art")
      ).toBe("http://localhost:8080");
    }
  );

  it("uses the production API for the production domain", () => {
    expect(resolveApiBaseUrl("www.tastematcher.art")).toBe(
      "https://api.tastematcher.art"
    );
  });

  it("requires an explicit URL for any other deployed host", () => {
    expect(() => resolveApiBaseUrl("unexpected.example.com")).toThrow(
      "REACT_APP_API_URL must be configured for this host"
    );
    expect(
      resolveApiBaseUrl(
        "tastematcher.art.example.com",
        "https://configured.example.com"
      )
    ).toBe("https://configured.example.com");
  });
});

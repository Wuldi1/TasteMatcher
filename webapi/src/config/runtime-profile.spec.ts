import {
  assertSafeRuntimeProfile,
  isProductionDataTarget,
  shouldUseSecureAuthCodes,
} from "./runtime-profile";

describe("runtime profile", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TASTEMATCHER_RUNTIME_MODE;
    delete process.env.TASTEMATCHER_DATA_ENV;
    delete process.env.TASTEMATCHER_LOCAL_PROD_ACK;
    delete process.env.TASTEMATCHER_EMAIL_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("treats the production data target independently of NODE_ENV", () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_DATA_ENV = "prd";

    expect(isProductionDataTarget()).toBe(true);
    expect(shouldUseSecureAuthCodes()).toBe(true);
  });

  it("accepts the guarded local-production profile", () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_RUNTIME_MODE = "local-production";
    process.env.TASTEMATCHER_DATA_ENV = "prd";
    process.env.TASTEMATCHER_LOCAL_PROD_ACK =
      "I_UNDERSTAND_THIS_USES_PRODUCTION_DATA";
    process.env.TASTEMATCHER_EMAIL_MODE = "verification-only";

    expect(() => assertSafeRuntimeProfile()).not.toThrow();
  });

  it("rejects a production data target without the guarded runtime profile", () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_DATA_ENV = "prd";

    expect(() => assertSafeRuntimeProfile()).toThrow(
      "Unsafe production-data configuration",
    );
  });

  it("rejects a known production endpoint without an explicit production data target", () => {
    process.env.NODE_ENV = "development";
    process.env.COSMOS_DB_ENDPOINT =
      "https://tastematcher-prd-cosmos.documents.azure.com:443/";

    expect(() => assertSafeRuntimeProfile()).toThrow(
      "Unsafe production-data configuration",
    );
  });

  it.each([
    ["TASTEMATCHER_DATA_ENV", "test"],
    ["TASTEMATCHER_LOCAL_PROD_ACK", "missing"],
    ["TASTEMATCHER_EMAIL_MODE", "send-all"],
    ["NODE_ENV", "prd"],
  ])("rejects unsafe local-production setting %s=%s", (key, value) => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_RUNTIME_MODE = "local-production";
    process.env.TASTEMATCHER_DATA_ENV = "prd";
    process.env.TASTEMATCHER_LOCAL_PROD_ACK =
      "I_UNDERSTAND_THIS_USES_PRODUCTION_DATA";
    process.env.TASTEMATCHER_EMAIL_MODE = "verification-only";
    process.env[key] = value;

    expect(() => assertSafeRuntimeProfile()).toThrow(
      "Unsafe local-production runtime configuration",
    );
  });
});

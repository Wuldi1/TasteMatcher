import {
  assertSafeRuntimeProfile,
  isConfiguredLocalLoginOverrideFor,
  isProductionDataTarget,
  shouldAcceptConfiguredLocalLoginCode,
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
    delete process.env.LOCAL_TEST_LOGIN_ENABLED;
    delete process.env.LOCAL_TEST_LOGIN_EMAIL;
    delete process.env.LOCAL_TEST_LOGIN_CODE;
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
      "https://tastematcher-prd-cosmos-sls.documents.azure.com:443/";

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

  it("accepts only the configured account and code in local-production", () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_RUNTIME_MODE = "local-production";
    process.env.LOCAL_TEST_LOGIN_ENABLED = "true";
    process.env.LOCAL_TEST_LOGIN_EMAIL = "seller@example.com";
    process.env.LOCAL_TEST_LOGIN_CODE = "123456";

    expect(
      shouldAcceptConfiguredLocalLoginCode(" Seller@Example.com ", "123456"),
    ).toBe(true);
    expect(isConfiguredLocalLoginOverrideFor("seller@example.com")).toBe(true);
    expect(
      shouldAcceptConfiguredLocalLoginCode("other@example.com", "123456"),
    ).toBe(false);
    expect(
      shouldAcceptConfiguredLocalLoginCode("seller@example.com", "000000"),
    ).toBe(false);
  });

  it("rejects the fixed-code override in deployed production", () => {
    process.env.NODE_ENV = "production";
    process.env.TASTEMATCHER_RUNTIME_MODE = "local-production";
    process.env.LOCAL_TEST_LOGIN_ENABLED = "true";
    process.env.LOCAL_TEST_LOGIN_EMAIL = "seller@example.com";
    process.env.LOCAL_TEST_LOGIN_CODE = "123456";

    expect(
      shouldAcceptConfiguredLocalLoginCode("seller@example.com", "123456"),
    ).toBe(false);
    expect(isConfiguredLocalLoginOverrideFor("seller@example.com")).toBe(false);
  });
});

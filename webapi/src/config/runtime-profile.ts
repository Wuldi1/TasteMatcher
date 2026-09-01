const LOCAL_PRODUCTION_ACK = "I_UNDERSTAND_THIS_USES_PRODUCTION_DATA";

/** True when this process is deliberately connected to production data. */
export function isProductionDataTarget(): boolean {
  return process.env.TASTEMATCHER_DATA_ENV === "prd";
}

/** True only for the guarded developer-machine, production-data profile. */
export function isLocalProductionRuntime(): boolean {
  return process.env.TASTEMATCHER_RUNTIME_MODE === "local-production";
}

/** Production-backed authentication must never use predictable test codes. */
export function shouldUseSecureAuthCodes(): boolean {
  return process.env.NODE_ENV === "prd" || isProductionDataTarget();
}

/**
 * Allows one explicitly configured account to use a fixed verification code on
 * a developer machine connected to production data. This is intentionally
 * unavailable in deployed production, regardless of configuration.
 */
export function isConfiguredLocalLoginOverrideFor(email: string): boolean {
  if (
    !isLocalProductionRuntime() ||
    process.env.NODE_ENV === "prd" ||
    process.env.NODE_ENV === "production" ||
    process.env.LOCAL_TEST_LOGIN_ENABLED !== "true"
  ) {
    return false;
  }

  const configuredEmail =
    process.env.LOCAL_TEST_LOGIN_EMAIL?.trim().toLowerCase();
  const configuredCode = process.env.LOCAL_TEST_LOGIN_CODE?.trim();

  return Boolean(
    configuredEmail &&
      configuredCode &&
      email.trim().toLowerCase() === configuredEmail,
  );
}

/** Accepts the configured code only for the configured local override account. */
export function shouldAcceptConfiguredLocalLoginCode(
  email: string,
  code: string,
): boolean {
  return (
    isConfiguredLocalLoginOverrideFor(email) &&
    code.trim() === process.env.LOCAL_TEST_LOGIN_CODE?.trim()
  );
}

/** Real email delivery is limited to the deployed production behavior mode. */
export function shouldSendRealEmail(): boolean {
  return (
    process.env.NODE_ENV === "prd" &&
    !isLocalProductionRuntime() &&
    process.env.TASTEMATCHER_EMAIL_MODE !== "disabled"
  );
}

/** Verification messages are the only permitted local-production delivery. */
export function shouldSendVerificationEmail(): boolean {
  return (
    shouldSendRealEmail() ||
    (isLocalProductionRuntime() &&
      process.env.TASTEMATCHER_EMAIL_MODE === "verification-only")
  );
}

/** Detect the confirmed production resource names without logging any value. */
function hasKnownProductionResource(): boolean {
  const configuredResources = [
    process.env.AZURE_STORAGE_ACCOUNT,
    process.env.AzureWebJobsStorage,
    process.env.COSMOS_DB_ENDPOINT,
    process.env.AZURE_AI_VISION_ENDPOINT,
    process.env.IMAGE_PROCESSING_QUEUE_NAME,
    process.env.NEW_ARTWORK_QUEUE_NAME,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  return [
    "tastematcherprdsa",
    "tastematcher-prd-cosmos-sls",
    "tastematcher-prd-vision",
    "tastematcher-prd-indexing-jobs",
    "tastematcher-prd-new-artwork-jobs",
  ].some((resourceName) => configuredResources.includes(resourceName));
}

/**
 * Fail fast when a local process requests production data without all safety
 * controls. This validation intentionally does not change deployed production.
 */
export function assertSafeRuntimeProfile(): void {
  if (!isLocalProductionRuntime()) {
    const isDeployedProduction =
      process.env.NODE_ENV === "prd" || process.env.NODE_ENV === "production";
    if (
      !isDeployedProduction &&
      (isProductionDataTarget() || hasKnownProductionResource())
    ) {
      throw new Error(
        "Unsafe production-data configuration: local production resources require the guarded local-production runtime profile.",
      );
    }
    return;
  }

  const isSafe =
    process.env.NODE_ENV !== "prd" &&
    process.env.NODE_ENV !== "production" &&
    isProductionDataTarget() &&
    process.env.TASTEMATCHER_LOCAL_PROD_ACK === LOCAL_PRODUCTION_ACK &&
    process.env.TASTEMATCHER_EMAIL_MODE === "verification-only";

  if (!isSafe) {
    throw new Error(
      "Unsafe local-production runtime configuration: production data requires the explicit acknowledgement, non-production NODE_ENV, and verification-only email mode.",
    );
  }
}

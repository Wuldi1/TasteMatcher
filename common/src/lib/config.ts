// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Validates all required env vars.
// 3. Structured logging for missing config.
// 4. Provides helpful error messages for local vs Azure
// -----------------------------------------------------------

import { ThumbnailSize } from "../types/artwork.types";

/**
 * Application configuration loaded from environment variables.
 *
 * For local development: values come from local.settings.json
 * For Azure: values come from Application Settings
 *
 * Azure Functions runtime automatically loads these into process.env
 */
export interface AppConfig {
  azure: {
    storageConnectionString: string;
    storageContainerOriginals: string;
    storageContainerThumbnails: string;
    aiVisionEndpoint: string;
    aiVisionKey: string;
  };
  cosmos: {
    endpoint: string;
    key: string;
    database: string;
  };
  storage: {
    account: string;
    accountKey: string;
    supportedMimeTypes: string[];
  };
  queue: {
    name: string;
    visibilityTimeout: number;
    maxDequeueCount: number;
  };
  thumbnails: {
    sizes: ThumbnailSize[];
  };
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  logging: {
    level: string;
  };
}

/**
 * Get required environment variable or throw error
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // More helpful error message with debugging info
    const availableKeys = Object.keys(process.env).filter(
      (k) =>
        k.startsWith("AZURE") ||
        k.startsWith("IMAGE") ||
        k === "AzureWebJobsStorage",
    );

    throw new Error(
      `Required environment variable '${key}' is not set.\n` +
        `Available Azure-related env vars: ${availableKeys.join(", ")}\n` +
        `Check:\n` +
        `  - Local dev: Ensure 'local.settings.json' exists in the functions directory\n` +
        `  - Azure: Verify Application Settings are configured for the Function App\n` +
        `  - Current directory: ${process.cwd()}`,
    );
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Load and validate configuration from environment.
 *
 * Environment variables are provided by:
 * - Local development: local.settings.json (loaded by Azure Functions Core Tools)
 * - Azure deployment: Application Settings (configured via provision script)
 *
 * Throws if required variables are missing with helpful debugging information.
 */
export function loadConfig(): AppConfig {
  // Debug: Log that we're loading config (remove in production)
  if (process.env.NODE_ENV === "development") {
    console.log("[Config] Loading configuration from environment...");
  }

  return {
    azure: {
      storageConnectionString: getRequiredEnv("AzureWebJobsStorage"),
      storageContainerOriginals: "originals",
      storageContainerThumbnails: "derivatives",
      aiVisionEndpoint: getRequiredEnv("AZURE_AI_VISION_ENDPOINT"),
      aiVisionKey: getRequiredEnv("AZURE_AI_VISION_KEY"),
    },
    cosmos: {
      endpoint: getRequiredEnv("COSMOS_DB_ENDPOINT"),
      key: getRequiredEnv("COSMOS_DB_KEY"),
      database: getRequiredEnv("COSMOS_DB_DATABASE"),
    },
    storage: {
      account: getRequiredEnv("AZURE_STORAGE_ACCOUNT"),
      accountKey: getRequiredEnv("AZURE_STORAGE_ACCOUNT_KEY"),
      supportedMimeTypes: getOptionalEnv(
        "SUPPORTED_MIME_TYPES",
        "image/jpeg,image/png,image/gif",
      ).split(","),
    },
    queue: {
      name: getRequiredEnv("IMAGE_PROCESSING_QUEUE_NAME"),
      visibilityTimeout: parseInt(
        getOptionalEnv("QUEUE_VISIBILITY_TIMEOUT", "300"),
        10,
      ),
      maxDequeueCount: parseInt(
        getOptionalEnv("QUEUE_MAX_DEQUEUE_COUNT", "5"),
        10,
      ),
    },
    thumbnails: {
      sizes: [
        { width: 150, height: 150 },
        { width: 400, height: 400 },
        { width: 800, height: 800 },
      ],
    },
    retry: {
      maxAttempts: parseInt(getOptionalEnv("RETRY_MAX_ATTEMPTS", "3"), 10),
      initialDelayMs: parseInt(
        getOptionalEnv("RETRY_INITIAL_DELAY_MS", "1000"),
        10,
      ),
      maxDelayMs: parseInt(getOptionalEnv("RETRY_MAX_DELAY_MS", "30000"), 10),
      backoffMultiplier: parseFloat(
        getOptionalEnv("RETRY_BACKOFF_MULTIPLIER", "2"),
      ),
    },
    logging: {
      level: getOptionalEnv("LOG_LEVEL", "info"),
    },
  };
}

// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Validates all required env vars.
// 3. Unit tests in config.spec.ts.
// 4. Structured logging for missing config.
// -----------------------------------------------------------
import { ThumbnailSize } from '@tastematcher/common';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

/**
 * Application configuration loaded from environment variables.
 * Validates required settings at startup.
 */
export interface AppConfig {
  azure: {
    storageConnectionString: string;
    searchEndpoint: string;
    searchKey: string;
    searchIndexName: string;
    aiVisionEndpoint: string;
    aiVisionKey: string;
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
 * Load and validate configuration from environment.
 * Throws if required variables are missing.
 */
export function loadConfig(): AppConfig {
  const required = [
    'AZURE_STORAGE_CONNECTION_STRING',
    'AZURE_SEARCH_ENDPOINT',
    'AZURE_SEARCH_ADMIN_KEY',
    'AZURE_SEARCH_INDEX_NAME',
    'AZURE_AI_VISION_ENDPOINT',
    'AZURE_AI_VISION_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    azure: {
      storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
      searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      searchKey: process.env.AZURE_SEARCH_ADMIN_KEY!,
      searchIndexName: process.env.AZURE_SEARCH_INDEX_NAME!,
      aiVisionEndpoint: process.env.AZURE_AI_VISION_ENDPOINT!,
      aiVisionKey: process.env.AZURE_AI_VISION_KEY!,
    },
    queue: {
      name: process.env.IMAGE_PROCESSING_QUEUE_NAME || 'image-processing',
      visibilityTimeout: 300, // 5 minutes
      maxDequeueCount: 5,
    },
    thumbnails: {
      sizes: [
        { width: 150, height: 150 },
        { width: 400, height: 400 },
        { width: 800, height: 800 },
      ],
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
  };
}

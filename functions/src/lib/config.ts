import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') });

export interface Config {
  azure: {
    storageConnectionString: string;
    imageProcessingQueueName: string;
    searchEndpoint: string;
    searchKey: string;
    searchIndexName: string;
    aiVisionEndpoint: string;
    aiVisionKey: string;
  };
}

export function loadConfig(): Config {
  const required = [
    'AzureWebJobsStorage',
    'AZURE_SEARCH_ENDPOINT',
    'AZURE_SEARCH_ADMIN_KEY',
    'AZURE_AI_VISION_ENDPOINT',
    'AZURE_AI_VISION_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    azure: {
      storageConnectionString: process.env.AzureWebJobsStorage!,
      imageProcessingQueueName: process.env.IMAGE_PROCESSING_QUEUE_NAME!,
      searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      searchKey: process.env.AZURE_SEARCH_ADMIN_KEY!,
      searchIndexName: process.env.AZURE_SEARCH_INDEX_NAME!,
      aiVisionEndpoint: process.env.AZURE_AI_VISION_ENDPOINT!,
      aiVisionKey: process.env.AZURE_AI_VISION_KEY!,
    },
  };
}

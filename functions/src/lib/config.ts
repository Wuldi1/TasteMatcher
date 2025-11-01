export interface Config {
  storageConnectionString: string;
  queueName: string;
  searchEndpoint: string;
  searchApiKey: string;
  searchIndexName: string;
  openaiApiKey: string;
  openaiEmbeddingModel: string;
}

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  storageConnectionString: getEnvVar('STORAGE_CONNECTION_STRING'),
  queueName: getEnvVar('QUEUE_NAME'),
  searchEndpoint: getEnvVar('SEARCH_ENDPOINT'),
  searchApiKey: getEnvVar('SEARCH_API_KEY'),
  searchIndexName: getEnvVar('SEARCH_INDEX_NAME'),
  openaiApiKey: getEnvVar('OPENAI_API_KEY'),
  openaiEmbeddingModel: getEnvVar('OPENAI_EMBEDDING_MODEL'),
};

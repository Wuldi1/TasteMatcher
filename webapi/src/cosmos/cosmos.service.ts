import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CosmosClient, CosmosClientOptions, Container, Database } from '@azure/cosmos';

const USER_AGENT_SUFFIX = 'TasteMatcher-WebAPI';

export interface CosmosConfig {
  endpoint: string;
  key: string;
  database: string;
}

/**
 * CosmosService manages the lifecycle of the shared CosmosClient instance and exposes typed container accessors.
 */
@Injectable()
export class CosmosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CosmosService.name);
  private readonly config: CosmosConfig;
  private client?: CosmosClient;
  private database?: Database;
  private readonly containerCache = new Map<string, Container>();

  constructor() {
    this.config = this.readConfigFromEnv();
  }

  async onModuleInit(): Promise<void> {
    const start = Date.now();
    this.logger.debug({ msg: 'Initializing CosmosService', database: this.config.database });

    // Create ArtworkPreferences container if it doesn't exist
    const preferencesContainerDef = {
      id: 'ArtworkPreferences',
      partitionKey: {
        paths: ['/userId'], // Partition by userId for efficient user-scoped queries
        kind: 'Hash' as any,
      },
    };

    var database = await this.getDatabase();

    await database.containers.createIfNotExists(preferencesContainerDef);
    this.logger.log('ArtworkPreferences container initialized');

    this.logger.log({
      msg: 'CosmosService initialized',
      database: this.config.database,
      durationMs: Date.now() - start,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.debug({ msg: 'Disposing CosmosService' });
    await this.client?.dispose?.();
    this.logger.log({ msg: 'CosmosService disposed' });
  }

  /**
   * Returns the Cosmos DB client instance, guaranteeing initialization.
   */
  async getClient(): Promise<CosmosClient> {
    await this.ensureClient();
    return this.client!;
  }

  /**
   * Returns the Cosmos database instance, guaranteeing initialization.
   */
  async getDatabase(): Promise<Database> {
    await this.ensureClient();
    return this.database!;
  }

  /**
   * Returns a cached container reference. Containers are resolved lazily on first access.
   */
  async getContainer(containerName: string): Promise<Container> {
    await this.ensureClient();

    const cached = this.containerCache.get(containerName);
    if (cached) {
      return cached;
    }

    const container = this.database!.container(containerName);
    this.containerCache.set(containerName, container);
    this.logger.debug({ msg: 'Cached Cosmos container', containerName });
    return container;
  }

  /**
   * Convenience getter for the Domains container.
   */
  async getDomainsContainer(): Promise<Container> {
    return this.getContainer('Domains');
  }

  /**
   * Convenience getter for the Artworks container.
   */
  async getArtworksContainer(): Promise<Container> {
    return this.getContainer('Artworks');
  }

  /**
   * Convenience getter for the Users container.
   */
  async getUsersContainer(): Promise<Container> {
    return this.getContainer('Users');
  }

  /**
   * Convenience getter for the Sessions container.
   */
  async getSessionsContainer(): Promise<Container> {
    return this.getContainer('Sessions');
  }

  private async ensureClient(): Promise<void> {
    if (this.client && this.database) {
      return;
    }

    try {
      const options: CosmosClientOptions = {
        endpoint: this.config.endpoint,
        key: this.config.key,
        userAgentSuffix: USER_AGENT_SUFFIX,
      };

      this.client = new CosmosClient(options);
      this.database = this.client.database(this.config.database);
      this.logger.debug({
        msg: 'Cosmos client created',
        database: this.config.database
      });
    } catch (error) {
      this.logger.error({
        msg: 'Failed to initialize Cosmos client',
        error,
      });
      throw error;
    }
  }

  private readConfigFromEnv(): CosmosConfig {
    const { COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE } =
      process.env;

    if (!COSMOS_DB_ENDPOINT) {
      throw new Error('COSMOS_DB_ENDPOINT environment variable is required');
    }

    if (!COSMOS_DB_KEY) {
      throw new Error('COSMOS_DB_KEY environment variable is required');
    }

    if (!COSMOS_DB_DATABASE) {
      throw new Error('COSMOS_DB_DATABASE environment variable is required');
    }

    return {
      endpoint: COSMOS_DB_ENDPOINT,
      key: COSMOS_DB_KEY,
      database: COSMOS_DB_DATABASE
    };
  }
}

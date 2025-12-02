import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CosmosClient, CosmosClientOptions, Container, Database, PartitionKeyKind } from '@azure/cosmos';
import { AppConfig, loadConfig } from '../../lib/config';
import { createLogger } from '../../lib/logger';
import { User } from '../../types/user.types';

const logger = createLogger('CosmosService');

/**
 * CosmosService manages the lifecycle of the shared CosmosClient instance and exposes typed container accessors.
 */
@Injectable()
export class CosmosService implements OnModuleInit, OnModuleDestroy {
  private readonly appConfig: AppConfig;
  private client?: CosmosClient;
  private database?: Database;
  private readonly containerCache = new Map<string, Container>();

  constructor() {
    this.appConfig = loadConfig();
  }

  async onModuleInit(): Promise<void> {
    const start = Date.now();
    logger.debug({ msg: 'Initializing CosmosService', database: this.appConfig.cosmos.database });

    // Create ArtworkPreferences container if it doesn't exist
    const preferencesContainerDef = {
      id: 'ArtworkPreferences',
      partitionKey: {
        paths: ['/userId'], // Partition by userId for efficient user-scoped queries
        kind: PartitionKeyKind.Hash,
      },
    };

    const database = await this.getDatabase();

    await database.containers.createIfNotExists(preferencesContainerDef);
    logger.debug({ msg: 'ArtworkPreferences container initialized' });

    logger.debug({
      msg: 'CosmosService initialized',
      database: this.appConfig.cosmos.database,
      durationMs: Date.now() - start,
    });
  }

  async onModuleDestroy(): Promise<void> {
    logger.debug({ msg: 'Disposing CosmosService' });
    await this.client?.dispose?.();
    logger.debug({ msg: 'CosmosService disposed' });
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

    logger.debug({ msg: 'Cached Cosmos container', containerName });
    return container;
  }

  /**
   * Convenience getter for the ArtworkPreferences container.
   */
  async getArtworkPreferencesContainer(): Promise<Container> {
    return this.getContainer('ArtworkPreferences');
  }

  /**
   * Convenience getter for the Artworks container.
   */
  async getArtworksContainer(): Promise<Container> {
    return this.getContainer('Artworks');
  }

  async getUser(domainId: string, userId: string): Promise<User> {
    const usersContainer = await this.getContainer('Core');
    const { resource } = await usersContainer.item(userId, domainId).read<User>();
    if (!resource) {
      throw new Error(`User not found: ${userId} in domain ${domainId}`);
    }
    logger.info({ msg: 'Fetched user from Cosmos DB' });
    return resource;
  }

  private async ensureClient(): Promise<void> {
    if (this.client && this.database) {
      return;
    }

    try {
      const options: CosmosClientOptions = {
        endpoint: this.appConfig.cosmos.endpoint,
        key: this.appConfig.cosmos.key
      };

      this.client = new CosmosClient(options);
      this.database = this.client.database(this.appConfig.cosmos.database);
      logger.debug({
        msg: 'Cosmos client created',
        database: this.appConfig.cosmos.database
      });
    } catch (error) {
      logger.error({
        msg: 'Failed to initialize Cosmos client',
        error,
      });
      throw error;
    }
  }
}

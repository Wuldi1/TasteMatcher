// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------
import { CosmosClient } from '@azure/cosmos';
import { CosmosService } from './cosmos.service';

jest.mock('@azure/cosmos', () => {
  class MockContainer {
    constructor(public readonly id: string) {}
  }

  class MockDatabase {
    private readonly containers = new Map<string, MockContainer>();

    container(name: string): MockContainer {
      if (!this.containers.has(name)) {
        this.containers.set(name, new MockContainer(name));
      }
      return this.containers.get(name)!;
    }
  }

  class MockCosmosClient {
    public readonly createdDatabases: string[] = [];
    constructor(public readonly options: unknown) {}
    database(name: string): MockDatabase {
      this.createdDatabases.push(name);
      return new MockDatabase();
    }
    async dispose(): Promise<void> {
      return Promise.resolve();
    }
  }

  return {
    CosmosClient: MockCosmosClient,
    Database: MockDatabase,
    Container: MockContainer,
  };
});

describe('CosmosService', () => {
  const validEnv = {
    COSMOS_DB_ENDPOINT: 'https://example.documents.azure.com:443/',
    COSMOS_DB_KEY: 'test-key',
    COSMOS_DB_DATABASE: 'tastematcher',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COSMOS_DB_ENDPOINT = validEnv.COSMOS_DB_ENDPOINT;
    process.env.COSMOS_DB_KEY = validEnv.COSMOS_DB_KEY;
    process.env.COSMOS_DB_DATABASE = validEnv.COSMOS_DB_DATABASE;
    delete process.env.COSMOS_DB_PREFERRED_REGIONS;
  });

  afterEach(() => {
    delete process.env.COSMOS_DB_ENDPOINT;
    delete process.env.COSMOS_DB_KEY;
    delete process.env.COSMOS_DB_DATABASE;
    delete process.env.COSMOS_DB_PREFERRED_REGIONS;
  });

  it('throws when required environment variables are missing', () => {
    delete process.env.COSMOS_DB_ENDPOINT;
    expect(() => new CosmosService()).toThrow('COSMOS_DB_ENDPOINT environment variable is required');
  });

  it('initializes client and caches containers', async () => {
    const service = new CosmosService();
    await service.onModuleInit();

    const domains = await service.getDomainsContainer();
    const domainsAgain = await service.getDomainsContainer();
    expect(domains).toBe(domainsAgain);

    const generic = await service.getContainer('Artworks');
    expect(generic).not.toBe(domains);
    expect((CosmosClient as unknown as { mock?: jest.Mock }).mock).toBeUndefined();
  });

  it('supports custom preferred regions via environment variable', async () => {
    process.env.COSMOS_DB_PREFERRED_REGIONS = 'eastus, westeurope';
    const service = new CosmosService();
    await service.onModuleInit();

    const client = await service.getClient();
    const preferredLocations = (client as unknown as { options: { connectionPolicy?: { preferredLocations?: string[] } } }).options.connectionPolicy?.preferredLocations;
    expect(preferredLocations).toEqual(['eastus', 'westeurope']);
  });

  it('disposes the client on module destroy', async () => {
    const disposeSpy = jest.spyOn(CosmosClient.prototype as unknown as { dispose: () => Promise<void> }, 'dispose');
    const service = new CosmosService();
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

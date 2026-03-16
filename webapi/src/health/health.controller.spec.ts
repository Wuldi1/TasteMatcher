import { HttpStatus } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const mockCosmosService = {
    getContainer: jest.fn(),
  };
  const mockBlobService = {
    getBlobContainerClient: jest.fn(),
  };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AzureWebJobsStorage: "UseDevelopmentStorage=true",
      AZURE_AI_VISION_ENDPOINT: "https://vision.example",
      AZURE_AI_VISION_KEY: "vision-key",
      COSMOS_DB_ENDPOINT: "https://cosmos.example",
      COSMOS_DB_KEY: "cosmos-key",
      COSMOS_DB_DATABASE: "db",
      AZURE_STORAGE_ACCOUNT: "storage",
      AZURE_STORAGE_ACCOUNT_KEY: "storage-key",
      IMAGE_PROCESSING_QUEUE_NAME: "queue",
    };
    controller = new HealthController();
    (
      controller as unknown as {
        cosmosService: typeof mockCosmosService;
        blobService: typeof mockBlobService;
      }
    ).cosmosService = mockCosmosService;
    (
      controller as unknown as {
        cosmosService: typeof mockCosmosService;
        blobService: typeof mockBlobService;
      }
    ).blobService = mockBlobService;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns healthy only when database and storage checks pass", async () => {
    mockCosmosService.getContainer.mockResolvedValue({
      read: jest.fn().mockResolvedValue({}),
    });
    mockBlobService.getBlobContainerClient.mockResolvedValue({
      exists: jest.fn().mockResolvedValue(true),
    });

    await expect(controller.checkHealth()).resolves.toEqual(
      expect.objectContaining({
        status: "healthy",
        checks: {
          database: "ok",
          storage: "ok",
        },
      }),
    );
  });

  it("returns 503 when the blob container does not exist", async () => {
    mockCosmosService.getContainer.mockResolvedValue({
      read: jest.fn().mockResolvedValue({}),
    });
    mockBlobService.getBlobContainerClient.mockResolvedValue({
      exists: jest.fn().mockResolvedValue(false),
    });

    await expect(controller.checkHealth()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: expect.objectContaining({
        status: "unhealthy",
        checks: {
          database: "ok",
          storage: "error",
        },
      }),
    });
  });
});

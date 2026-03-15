import { InvocationContext } from "@azure/functions";

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockMetrics = {
  increment: jest.fn(),
  timing: jest.fn(),
};

const mockBlobService = {
  downloadBlob: jest.fn(),
  sendMessageToQueue: jest.fn(),
};

const mockThumbnailService = {
  generateAndUploadThumbnails: jest.fn(),
};

const mockVectorizationService = {
  generateEmbedding: jest.fn(),
};

const mockPatch = jest.fn();
const mockArtworksContainer = {
  item: jest.fn(() => ({
    patch: mockPatch,
  })),
};

const mockCosmosService = {
  getArtworksContainer: jest.fn(() => mockArtworksContainer),
};

jest.mock("uuid", () => ({
  v4: jest.fn(() => "notification-id"),
}));

jest.mock("@tastematcher/common", () => ({
  BlobService: jest.fn(() => mockBlobService),
  ThumbnailService: jest.fn(() => mockThumbnailService),
  VectorizationService: jest.fn(() => mockVectorizationService),
  CosmosService: jest.fn(() => mockCosmosService),
  createLogger: jest.fn(() => mockLogger),
  metrics: mockMetrics,
  loadConfig: jest.fn(() => ({
    azure: {
      storageConnectionString: "UseDevelopmentStorage=true",
      storageContainerOriginals: "originals",
      storageContainerThumbnails: "derivatives",
      aiVisionEndpoint: "https://vision.example.com",
      aiVisionKey: "vision-key",
    },
    cosmos: {
      endpoint: "https://cosmos.example.com",
      key: "cosmos-key",
      database: "tastematcher",
    },
    storage: {
      account: "storage",
      accountKey: "storage-key",
      supportedMimeTypes: ["image/jpeg"],
    },
    queue: {
      name: "image-processing",
      visibilityTimeout: 300,
      maxDequeueCount: 5,
    },
    thumbnails: {
      sizes: [],
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    logging: {
      level: "info",
    },
  })),
}));

import { processImagesFromBlob } from "./ProcessImagesFromBlob";

describe("ProcessImagesFromBlob", () => {
  const context = {
    invocationId: "test-invocation-id",
  } as InvocationContext;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEW_ARTWORK_QUEUE_NAME = "new-artwork-notifications";
  });

  it("stores thumbnails and vectors in cosmos without using search", async () => {
    mockBlobService.downloadBlob.mockResolvedValue(Buffer.from("image"));
    mockThumbnailService.generateAndUploadThumbnails.mockResolvedValue([
      { url: "https://blob/thumb.jpg", width: 150, height: 150 },
    ]);
    mockVectorizationService.generateEmbedding.mockResolvedValue({
      vector: new Array(1024).fill(0.5),
      model: "azure-vision-vectorize-2023-04-15",
    });
    mockPatch.mockResolvedValue(undefined);
    mockBlobService.sendMessageToQueue.mockResolvedValue(undefined);

    await processImagesFromBlob(
      {
        messageId: "msg-123",
        artworkId: "artwork-456",
        domainId: "domain-789",
        blobName: "test-image.jpg",
        uploadedAt: Date.now(),
        fileUrl: "https://blobstorage/test-image.jpg",
      },
      context,
    );

    expect(mockBlobService.downloadBlob).toHaveBeenCalledWith(
      "originals",
      "test-image.jpg",
    );
    expect(
      mockThumbnailService.generateAndUploadThumbnails,
    ).toHaveBeenCalledWith(Buffer.from("image"), "domain-789", "artwork-456");
    expect(mockVectorizationService.generateEmbedding).toHaveBeenCalledWith(
      "https://blobstorage/test-image.jpg",
      "msg-123",
    );
    expect(mockCosmosService.getArtworksContainer).toHaveBeenCalled();
    expect(mockArtworksContainer.item).toHaveBeenCalledWith(
      "artwork-456",
      "domain-789",
    );
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "set", path: "/vector", value: new Array(1024).fill(0.5) },
      {
        op: "set",
        path: "/vectorModel",
        value: "azure-vision-vectorize-2023-04-15",
      },
      { op: "replace", path: "/updatedAt", value: expect.any(Number) },
    ]);
    expect(mockBlobService.sendMessageToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "notification-id",
        artworkId: "artwork-456",
        domainId: "domain-789",
      }),
      "new-artwork-notifications",
    );
  });

  it("fails when blob download fails", async () => {
    mockBlobService.downloadBlob.mockRejectedValue(new Error("Blob not found"));

    await expect(
      processImagesFromBlob(
        {
          messageId: "msg-err",
          artworkId: "artwork-456",
          domainId: "domain-789",
          blobName: "missing.jpg",
          uploadedAt: Date.now(),
          fileUrl: "https://blobstorage/missing.jpg",
        },
        context,
      ),
    ).rejects.toThrow("Blob not found");

    expect(
      mockThumbnailService.generateAndUploadThumbnails,
    ).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

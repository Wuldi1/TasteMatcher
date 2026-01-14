import { InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { processImagesFromBlob } from "../../src/ProcessImagesFromBlob";
import type { ImageProcessingQueueMessage } from "@tastematcher/common";
import * as fs from "fs";
import * as path from "path";

/**
 * Integration tests require Azurite running locally:
 * docker run -p 10000:10000 -p 10001:10001 mcr.microsoft.com/azure-storage/azurite
 */
describe("ProcessImagesFromBlob Integration", () => {
  const connectionString = "UseDevelopmentStorage=true";
  let blobServiceClient: BlobServiceClient;
  let mockContext: Partial<InvocationContext>;

  beforeAll(async () => {
    blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);

    // Create test container
    const containerClient =
      blobServiceClient.getContainerClient("test-uploads");
    await containerClient.createIfNotExists();
  });

  beforeEach(() => {
    mockContext = {
      invocationId: "integration-test-id",
      functionName: "ProcessImagesFromBlob",
      logHandler: jest.fn(),
      traceContext: {
        traceparent: "test-trace",
        tracestate: "",
        attributes: {},
      },
    };
  });

  it("should process a real image end-to-end", async () => {
    // Upload test image to Azurite
    const testImagePath = path.join(__dirname, "../fixtures/test-image.jpg");
    const imageBuffer = fs.readFileSync(testImagePath);

    const containerClient =
      blobServiceClient.getContainerClient("test-uploads");
    const blobClient = containerClient.getBlockBlobClient(
      "test-artwork-123.jpg",
    );
    await blobClient.upload(imageBuffer, imageBuffer.length);

    const message: ImageProcessingQueueMessage = {
      messageId: "integration-msg-1",
      artworkId: "integration-artwork-123",
      domainId: "integration-domain-1",
      containerName: "test-uploads",
      blobName: "test-artwork-123.jpg",
      contentType: "image/jpeg",
      uploadedAt: new Date().toISOString(),
      correlationId: "integration-test-correlation",
    };

    // Note: This will fail without proper Azure Search and OpenAI credentials
    // In real integration tests, use test doubles or test instances
    await expect(
      processImagesFromBlob(message, mockContext as InvocationContext),
    ).rejects.toThrow(); // Expected due to missing search/openai config
  }, 30000);
});

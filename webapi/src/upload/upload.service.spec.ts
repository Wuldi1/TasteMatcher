import { BadRequestException } from "@nestjs/common";
import { UploadService } from "./upload.service";

describe("UploadService", () => {
  const blobService = {
    validateImageFile: jest.fn(),
    uploadBlob: jest.fn(),
    sendMessageToQueue: jest.fn(),
  };
  const vectorizationService = { generateEmbedding: jest.fn() };
  const items = {
    create: jest.fn(),
    query: jest.fn(),
  };
  const cosmosService = {
    getArtworksContainer: jest.fn().mockResolvedValue({ items }),
  };
  let service: UploadService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, "log").mockImplementation();
    service = new UploadService(
      blobService as never,
      cosmosService as never,
      vectorizationService as never,
    );
    blobService.uploadBlob.mockResolvedValue("https://blob.test/original.jpg");
    vectorizationService.generateEmbedding.mockResolvedValue({
      vector: [1, 2],
      model: "test-model",
    });
    items.create.mockImplementation(async (artwork) => ({ resource: artwork }));
  });

  afterEach(() => consoleSpy.mockRestore());

  it("preserves manual payload parsing and shares ingestion behavior", async () => {
    const result = await service.uploadManualArtwork(
      "domain-1",
      { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
      {
        artwork: JSON.stringify({
          title: "Manual work",
          tags: ["manual"],
          shouldDisplayPrice: true,
        }),
      },
      { id: "owner-1", role: "domain_owner" },
    );

    expect(blobService.validateImageFile).toHaveBeenCalledTimes(1);
    expect(blobService.uploadBlob).toHaveBeenCalledTimes(1);
    expect(vectorizationService.generateEmbedding).toHaveBeenCalledWith(
      "https://blob.test/original.jpg",
      expect.any(String),
    );
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "domain-1",
        title: "Manual work",
        uploadedBy: "owner-1",
        vector: [1, 2],
      }),
    );
    expect(result).not.toHaveProperty("vector");
    expect(result).not.toHaveProperty("vectorModel");
  });

  it("keeps vectorization best-effort and still persists the artwork", async () => {
    vectorizationService.generateEmbedding.mockRejectedValue(
      new Error("vision unavailable"),
    );
    await expect(
      service.uploadAutomaticArtwork(
        "domain-1",
        { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
        { title: "Automatic work" },
        { id: "owner-1", role: "domain_owner" },
      ),
    ).resolves.toMatchObject({ title: "Automatic work" });
    expect(items.create).toHaveBeenCalledTimes(1);
  });

  it("persists an omitted automatic-upload date as an empty string", async () => {
    const result = await service.uploadAutomaticArtwork(
      "domain-1",
      { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
      { title: "Automatic work" },
      { id: "owner-1", role: "domain_owner" },
    );

    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: "" }),
    );
    expect(result.date).toBe("");
  });

  it("uses a forced deterministic ID only for automatic ingestion", async () => {
    const forcedId = "a487ad8d-fbab-55c7-8ad6-19b13cb132f8";
    await service.uploadAutomaticArtwork(
      "domain-1",
      { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
      { title: "Automatic work" },
      { id: "owner-1", role: "domain_owner" },
      forcedId,
    );
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: forcedId }),
    );

    await service.uploadManualArtwork(
      "domain-1",
      { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
      { title: "Manual work" },
      { id: "owner-1", role: "domain_owner" },
    );
    expect(items.create.mock.calls[1][0].id).not.toBe(forcedId);
    expect(items.create.mock.calls[1][0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("preserves manual invalid metadata errors", async () => {
    await expect(
      service.uploadManualArtwork(
        "domain-1",
        { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
        { artwork: "not-json" },
        { id: "owner-1", role: "domain_owner" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(blobService.uploadBlob).not.toHaveBeenCalled();
  });
});

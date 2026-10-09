import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Artwork, QueryParams } from "@tastematcher/common";
import { ArtworksService } from "./artworks.service";

const buildArtwork = (id: string, overrides: Partial<Artwork> = {}): Artwork =>
  ({
    id,
    domainId: "domain-1",
    type: "artwork",
    title: `Artwork ${id}`,
    description: "Description",
    artist: "Artist",
    date: "2024",
    filename: `${id}.jpg`,
    vector: Array.from({ length: 1024 }, () => 1),
    vectorModel: "test-model",
    isPrivate: false,
    isAuction: false,
    createdAt: Date.now(),
    ...overrides,
  }) as Artwork;

const setupService = () => {
  const service = new ArtworksService({} as never);
  const artworksContainer = {
    items: {
      query: jest.fn(),
    },
    item: jest.fn(),
  };

  (
    service as unknown as { cosmosService: Record<string, jest.Mock> }
  ).cosmosService = {
    getArtworksContainer: jest.fn().mockResolvedValue(artworksContainer),
    getArtworkPreferencesContainer: jest.fn(),
  };

  return { service, artworksContainer };
};

describe("ArtworksService.findAll", () => {
  beforeAll(() => {
    process.env.AzureWebJobsStorage = "UseDevelopmentStorage=true";
    process.env.AZURE_AI_VISION_ENDPOINT = "https://example.com";
    process.env.AZURE_AI_VISION_KEY = "test-key";
    process.env.COSMOS_DB_ENDPOINT = "https://example.com";
    process.env.COSMOS_DB_KEY = "test-key";
    process.env.COSMOS_DB_DATABASE = "test-db";
    process.env.AZURE_STORAGE_ACCOUNT = "test-account";
    process.env.AZURE_STORAGE_ACCOUNT_KEY = "test-key";
    process.env.IMAGE_PROCESSING_QUEUE_NAME = "test-queue";
  });

  it("advances continuation tokens until it collects visible artworks", async () => {
    const { service, artworksContainer } = setupService();
    const hiddenArtwork = buildArtwork("hidden", {
      isPrivate: true,
      uploadedBy: "dealer-2",
    });
    const visibleArtwork = buildArtwork("visible");

    artworksContainer.items.query.mockImplementation(
      (
        _query: unknown,
        options?: { continuationToken?: string; maxItemCount?: number },
      ) => ({
        fetchNext: jest.fn().mockResolvedValue(
          options?.continuationToken === "page-1"
            ? {
                resources: [visibleArtwork],
                continuationToken: "page-2",
                hasMoreResults: true,
              }
            : {
                resources: [hiddenArtwork],
                continuationToken: "page-1",
                hasMoreResults: true,
              },
        ),
      }),
    );

    const result = await service.findAll(
      "domain-1",
      { limit: 1 } satisfies QueryParams<Artwork>,
      undefined,
      {
        id: "customer-1",
        role: "customer",
        invitedBy: "owner-1",
      },
    );

    expect(result.items.map((item) => item.id)).toEqual(["visible"]);
    expect(result.continuationToken).toBe("page-2");
    expect(result.hasMore).toBe(true);
    expect(artworksContainer.items.query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: expect.stringContaining("c.domainId = @param0"),
      }),
      expect.objectContaining({
        maxItemCount: 1,
        continuationToken: undefined,
      }),
    );
    expect(artworksContainer.items.query).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({
        maxItemCount: 1,
        continuationToken: "page-1",
      }),
    );
  });

  it("stops pagination when cosmos has no more results", async () => {
    const { service, artworksContainer } = setupService();
    const visibleArtwork = buildArtwork("only-page");

    artworksContainer.items.query.mockReturnValue({
      fetchNext: jest.fn().mockResolvedValue({
        resources: [visibleArtwork],
        continuationToken: undefined,
        hasMoreResults: false,
      }),
    });

    const result = await service.findAll("domain-1", { limit: 1 });

    expect(result.items.map((item) => item.id)).toEqual(["only-page"]);
    expect(result.continuationToken).toBeUndefined();
    expect(result.hasMore).toBe(false);
    expect(artworksContainer.items.query).toHaveBeenCalledTimes(1);
  });
});

describe("ArtworksService mutation authorization", () => {
  it("rejects customer updates before reading artwork data", async () => {
    const { service, artworksContainer } = setupService();

    await expect(
      service.update(
        "domain-1",
        "artwork-1",
        { title: "Unauthorized title" },
        { id: "customer-1", role: "customer" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(artworksContainer.item).not.toHaveBeenCalled();
  });

  it("rejects customer deletes before deleting artwork data", async () => {
    const { service, artworksContainer } = setupService();

    await expect(
      service.remove("domain-1", "artwork-1", {
        id: "customer-1",
        role: "customer",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(artworksContainer.item).not.toHaveBeenCalled();
  });
});

describe("ArtworksService.findOne visibility", () => {
  const arrangeArtwork = (artwork: Artwork) => {
    const setup = setupService();
    setup.artworksContainer.item.mockReturnValue({
      read: jest.fn().mockResolvedValue({ resource: artwork }),
    });
    return setup;
  };

  it("returns public artwork to a customer", async () => {
    const artwork = buildArtwork("public");
    const { service } = arrangeArtwork(artwork);

    await expect(
      service.findOne("domain-1", artwork.id, {
        id: "customer-1",
        role: "customer",
        invitedBy: "dealer-1",
      }),
    ).resolves.toEqual(artwork);
  });

  it("returns private artwork uploaded by the customer's inviter", async () => {
    const artwork = buildArtwork("invited-private", {
      isPrivate: true,
      uploadedBy: "dealer-1",
    });
    const { service } = arrangeArtwork(artwork);

    await expect(
      service.findOne("domain-1", artwork.id, {
        id: "customer-1",
        role: "customer",
        invitedBy: "dealer-1",
      }),
    ).resolves.toEqual(artwork);
  });

  it("hides private artwork uploaded by an unrelated dealer", async () => {
    const artwork = buildArtwork("unrelated-private", {
      isPrivate: true,
      uploadedBy: "dealer-2",
    });
    const { service } = arrangeArtwork(artwork);

    await expect(
      service.findOne("domain-1", artwork.id, {
        id: "customer-1",
        role: "customer",
        invitedBy: "dealer-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("hides ended auctions from customers", async () => {
    const artwork = buildArtwork("ended-auction", {
      isAuction: true,
      endDate: new Date(Date.now() - 60_000).toISOString(),
    });
    const { service } = arrangeArtwork(artwork);

    await expect(
      service.findOne("domain-1", artwork.id, {
        id: "customer-1",
        role: "customer",
        invitedBy: "dealer-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

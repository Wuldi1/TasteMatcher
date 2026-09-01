import { BadRequestException } from "@nestjs/common";
import { Artwork, LikedStatus, ProposalItem } from "@tastematcher/common";
import { SalesService } from "./sales.service";

const buildArtwork = (
  id: string,
  overrides: Partial<Artwork> = {},
): Artwork => ({
  id,
  domainId: "domain-1",
  type: "artwork",
  title: `Artwork ${id}`,
  description: "",
  artist: "Artist",
  date: "2026",
  filename: `https://example.com/${id}.jpg`,
  vector: [],
  vectorModel: "test",
  isAuction: true,
  endDate: "2026-12-31T00:00:00.000Z",
  price: 1000,
  maxPrice: 1500,
  probabilityMatch: 0.8,
  recommendationScore: {
    imageSimilarity: 0.9,
    intentScore: 0.8,
    metadataScore: 0.7,
    behaviorScore: 0.6,
    finalScore: 0.8,
    reasons: ["matches painting interest", "similar to prior likes"],
  },
  ...overrides,
});

describe("SalesService AI draft generation", () => {
  const requiredEnv = {
    AzureWebJobsStorage: "UseDevelopmentStorage=true",
    AZURE_AI_VISION_ENDPOINT: "https://example.com",
    AZURE_AI_VISION_KEY: "test-key",
    COSMOS_DB_ENDPOINT: "https://example.documents.azure.com:443/",
    COSMOS_DB_KEY: "test-key",
    COSMOS_DB_DATABASE: "test-db",
    AZURE_STORAGE_ACCOUNT: "teststorage",
    AZURE_STORAGE_ACCOUNT_KEY: "test-key",
    IMAGE_PROCESSING_QUEUE_NAME: "test-queue",
  };

  const emailService = {};
  const usersService = {
    findOne: jest.fn(),
  };
  const domainsService = {};
  const domainActivityService = {
    recordActivity: jest.fn(),
  };
  const artworksService = {
    getRecommendationsForUser: jest.fn(),
  };

  const buildService = () =>
    new SalesService(
      emailService as never,
      usersService as never,
      domainsService as never,
      domainActivityService as never,
      artworksService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    Object.entries(requiredEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
    usersService.findOne.mockResolvedValue({
      id: "customer-1",
      name: "Ari Collector",
      email: "ari@example.com",
    });
  });

  it("generates an editable draft from active auction recommendations", async () => {
    artworksService.getRecommendationsForUser.mockResolvedValue([
      buildArtwork("high-unliked", { probabilityMatch: 0.97 }),
      buildArtwork("liked-mid", {
        likedStatus: LikedStatus.Liked,
        probabilityMatch: 0.86,
      }),
      buildArtwork("ended-liked", {
        likedStatus: LikedStatus.Liked,
        probabilityMatch: 0.99,
        endDate: "2025-12-31T00:00:00.000Z",
      }),
      buildArtwork("not-auction", {
        isAuction: false,
        probabilityMatch: 1,
      }),
    ]);

    const draft = await buildService().generateAIDraft(
      "domain-1",
      "customer-1",
      {
        id: "dealer-1",
        email: "dealer@example.com",
        role: "dealer",
        domainId: "domain-1",
      },
      2,
    );

    expect(artworksService.getRecommendationsForUser).toHaveBeenCalledWith(
      "domain-1",
      expect.objectContaining({ id: "dealer-1" }),
      "customer-1",
      20,
      0,
      true,
    );
    expect(draft.status).toBe("draft");
    expect(draft.items.map((item: ProposalItem) => item.artworkId)).toEqual([
      "liked-mid",
      "high-unliked",
    ]);
    expect(draft.items[0]).toEqual(
      expect.objectContaining({
        askedPrice: 1000,
        askedMaxPrice: 1500,
        status: "pending",
      }),
    );
    expect(draft.items[0]?.comments[0]?.text).toContain(
      "customer already liked",
    );
    expect(draft.metadata.viewingRoom).toEqual(
      expect.objectContaining({
        title: "Auction works selected for Ari Collector",
        priceVisibility: "show",
      }),
    );
    expect(draft.metadata.salesWorkflow).toEqual({
      stage: "ready_to_review",
      templateId: "auction_opportunity",
      priorityArtworkIds: ["liked-mid", "high-unliked"],
    });
  });

  it("rejects generation when there are no active auction recommendations", async () => {
    artworksService.getRecommendationsForUser.mockResolvedValue([
      buildArtwork("not-auction", { isAuction: false }),
      buildArtwork("ended", { endDate: "2025-12-31T00:00:00.000Z" }),
    ]);

    await expect(
      buildService().generateAIDraft(
        "domain-1",
        "customer-1",
        {
          id: "dealer-1",
          email: "dealer@example.com",
          role: "dealer",
          domainId: "domain-1",
        },
        8,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports the missing active-auction inventory before generation", async () => {
    usersService.findOne.mockResolvedValue({
      id: "customer-1",
      name: "Ari Collector",
      onboardingStatus: "completed",
      swipeCount: 25,
      preferenceVector: Array.from({ length: 1024 }, (_, index) =>
        index === 0 ? 1 : 0,
      ),
    });
    artworksService.getRecommendationsForUser.mockResolvedValue([
      buildArtwork("not-auction", { isAuction: false }),
    ]);

    await expect(
      buildService().getAIDraftEligibility("domain-1", "customer-1", {
        id: "dealer-1",
        email: "dealer@example.com",
        role: "dealer",
        domainId: "domain-1",
      }),
    ).resolves.toMatchObject({
      isEligible: false,
      activeAuctionRecommendationCount: 0,
      reasons: [expect.stringContaining("no active auction")],
    });
  });

  it("rejects unsupported customer engagement events", async () => {
    await expect(
      buildService().recordCustomerEngagement(
        "domain-1",
        "proposal-1",
        {
          id: "customer-1",
          email: "ari@example.com",
          role: "customer",
          domainId: "domain-1",
        },
        { event: "unsupported" as never },
      ),
    ).rejects.toThrow("Unsupported engagement event.");
  });
});

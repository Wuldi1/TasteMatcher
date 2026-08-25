import { Artwork } from "@tastematcher/common";
import { ArtworksService } from "./artworks.service";

const buildVector = (firstValue: number = 1, secondValue: number = 0): number[] => {
  const vector = new Array(1024).fill(0);
  vector[0] = firstValue;
  vector[1] = secondValue;
  return vector;
};

const buildArtwork = (id: string): Artwork => ({
  id,
  domainId: "domain-1",
  type: "artwork",
  title: `Artwork ${id}`,
  description: "desc",
  artist: "artist",
  date: "2024",
  filename: `${id}.jpg`,
  vector: buildVector(),
  vectorModel: "test-model",
  isPrivate: false,
});

const futureIso = (minutes: number = 30) =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

const pastIso = (minutes: number = 30) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

type CandidateResource = {
  id: string;
  isPrivate: boolean;
  uploadedBy: string;
  isAuction: boolean;
  endDate?: string;
};

type PreferenceResource = {
  artworkId: string;
  liked?: boolean;
  comment?: string;
};

const setupService = ({
  primaryCandidateResources = [
    {
      id: "rated-art",
      isPrivate: false,
      uploadedBy: "owner-1",
      isAuction: true,
      endDate: futureIso(),
    },
    {
      id: "fresh-art",
      isPrivate: false,
      uploadedBy: "owner-1",
      isAuction: true,
      endDate: futureIso(60),
    },
  ] as CandidateResource[],
  expiredAuctionCandidateResources = [] as CandidateResource[],
  pageResources = [buildArtwork("rated-art"), buildArtwork("fresh-art")],
  preferencesResources = [
    { artworkId: "rated-art", liked: true, comment: "seen" },
  ] as PreferenceResource[],
  userOverrides = {},
} = {}) => {
  const service = new ArtworksService({} as never);

  const createCandidateIterator = (resources: unknown[]) => ({
    hasMoreResults: jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false),
    fetchNext: jest.fn().mockResolvedValue({
      resources,
    }),
  });

  const pageIterator = {
    fetchAll: jest.fn().mockResolvedValue({
      resources: pageResources,
    }),
  };

  const artworksContainer = {
    items: {
      query: jest.fn().mockImplementation((query: {
        query: string;
        parameters?: Array<{ name: string; value: unknown }>;
      }) => {
        const excludedArtworkIds =
          query.parameters?.find(
            (parameter) => parameter.name === "@excludedArtworkIds",
          )?.value ?? [];
        const excludedIdSet = new Set(
          Array.isArray(excludedArtworkIds) ? excludedArtworkIds : [],
        );
        const filterExcluded = <
          T extends { id?: string | null | undefined },
        >(
          resources: T[],
        ) =>
          resources.filter(
            (resource) => !resource.id || !excludedIdSet.has(resource.id),
          );

        if (query.query.includes("ARRAY_CONTAINS(@ids, c.id)")) {
          const ids =
            query.parameters?.find((parameter) => parameter.name === "@ids")
              ?.value ?? [];
          const idSet = new Set(Array.isArray(ids) ? ids : []);
          return {
            fetchAll: jest.fn().mockResolvedValue({
              resources: pageResources.filter((resource) =>
                idSet.has(resource.id),
              ),
            }),
          };
        }

        if (
          query.query.includes("c.endDate > @activeAuctionAfter") ||
          query.query.includes("c.isAuction != true") ||
          query.query.includes("NOT IS_DEFINED(c.isAuction)")
        ) {
          return createCandidateIterator(
            filterExcluded(primaryCandidateResources),
          );
        }
        if (query.query.includes("c.endDate <= @activeAuctionAfter")) {
          return createCandidateIterator(
            filterExcluded(expiredAuctionCandidateResources),
          );
        }
        return pageIterator;
      }),
    },
  };

  const preferencesContainer = {
    items: {
      query: jest.fn().mockReturnValue({
        fetchAll: jest.fn().mockResolvedValue({
          resources: preferencesResources,
        }),
      }),
    },
  };

  (service as unknown as { cosmosService: Record<string, jest.Mock> })
    .cosmosService = {
    getUser: jest.fn().mockResolvedValue({
      id: "customer-1",
      domainId: "domain-1",
      onboardingStatus: "completed",
      swipeCount: 30,
      preferenceVector: buildVector(),
      name: "Customer",
      ...userOverrides,
    }),
    getArtworksContainer: jest.fn().mockResolvedValue(artworksContainer),
    getArtworkPreferencesContainer: jest
      .fn()
      .mockResolvedValue(preferencesContainer),
  };

  jest.spyOn(service, "getStats").mockResolvedValue({
    totalArtworks: 0,
    totalLikes: 0,
    totalDislikes: 0,
    totalSwiped: 30,
    recentlyAdded: 0,
  });

  return service;
};

describe("ArtworksService includeRated behavior", () => {
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

  it("excludes rated artworks when includeRated=false", async () => {
    const service = setupService();

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      20,
      0,
      false,
    );

    expect(results.map((artwork) => artwork.id)).toEqual(["fresh-art"]);
    expect(results[0]?.probabilityMatch).toBeCloseTo(0.845);

    const cosmosService = (
      service as unknown as { cosmosService: { getArtworksContainer: jest.Mock } }
    ).cosmosService;
    const artworksContainer = await cosmosService.getArtworksContainer.mock
      .results[0].value;
    const firstQueryArg = artworksContainer.items.query.mock.calls[0][0];

    expect(firstQueryArg.query).toContain("ORDER BY VectorDistance");
    expect(firstQueryArg.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "@excludedArtworkIds",
          value: ["rated-art"],
        }),
      ]),
    );
  });

  it("includes rated artworks when includeRated=true", async () => {
    const service = setupService();

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      20,
      0,
      true,
    );

    expect(results.map((artwork) => artwork.id)).toEqual(
      expect.arrayContaining(["rated-art", "fresh-art"]),
    );
    expect(results[0]?.probabilityMatch).toBeCloseTo(0.845);

    const cosmosService = (
      service as unknown as { cosmosService: { getArtworksContainer: jest.Mock } }
    ).cosmosService;
    const artworksContainer = await cosmosService.getArtworksContainer.mock
      .results[0].value;
    const firstQueryArg = artworksContainer.items.query.mock.calls[0][0];

    expect(firstQueryArg.query).toContain("ORDER BY VectorDistance");
    expect(firstQueryArg.parameters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "@excludedArtworkIds" }),
      ]),
    );
    expect(results[0]?.recommendationScore).toEqual(
      expect.objectContaining({
        finalScore: expect.any(Number),
        imageSimilarity: expect.any(Number),
        intentScore: expect.any(Number),
        metadataScore: expect.any(Number),
        behaviorScore: expect.any(Number),
        reasons: expect.any(Array),
      }),
    );
  });

  it("does not expose recommendation score details to customers", async () => {
    const service = setupService();

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "customer-1", role: "customer" },
      undefined,
      20,
      0,
      true,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).not.toHaveProperty("recommendationScore");
  });

  it("reranks recalled candidates using questionnaire metadata", async () => {
    const service = setupService({
      primaryCandidateResources: [
        {
          id: "photo-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
        {
          id: "painting-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
      ],
      pageResources: [
        {
          ...buildArtwork("photo-art"),
          medium: "Gelatin silver print",
          tags: ["photography"],
        },
        {
          ...buildArtwork("painting-art"),
          medium: "Oil on canvas",
          tags: ["painting"],
        },
      ],
      preferencesResources: [],
      userOverrides: {
        personalQuestionnaire: { mostInterestedInBuying: "Paintings" },
      },
    });

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      2,
      0,
      true,
    );

    expect(results.map((artwork) => artwork.id)).toEqual([
      "painting-art",
      "photo-art",
    ]);
    expect(results[0]?.probabilityMatch).toBeGreaterThan(
      results[1]?.probabilityMatch ?? 0,
    );
  });

  it("applies hybrid reranking before pagination", async () => {
    const service = setupService({
      primaryCandidateResources: [
        {
          id: "photo-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
        {
          id: "painting-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
      ],
      pageResources: [
        {
          ...buildArtwork("photo-art"),
          medium: "Gelatin silver print",
          tags: ["photography"],
        },
        {
          ...buildArtwork("painting-art"),
          medium: "Oil on canvas",
          tags: ["painting"],
        },
      ],
      preferencesResources: [],
      userOverrides: {
        personalQuestionnaire: { mostInterestedInBuying: "Paintings" },
      },
    });

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      1,
      1,
      true,
    );

    expect(results.map((artwork) => artwork.id)).toEqual(["photo-art"]);
  });

  it("uses liked and disliked artwork history as reranking signals", async () => {
    const service = setupService({
      primaryCandidateResources: [
        {
          id: "disliked-similar-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
        {
          id: "liked-similar-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
      ],
      pageResources: [
        {
          ...buildArtwork("liked-history-art"),
          artist: "Ada Artist",
          medium: "Bronze sculpture",
          tags: ["modern"],
        },
        {
          ...buildArtwork("disliked-history-art"),
          artist: "Bad Fit",
          medium: "Ink on paper",
          tags: ["works on paper"],
        },
        {
          ...buildArtwork("disliked-similar-art"),
          artist: "Bad Fit",
          medium: "Ink on paper",
          tags: ["works on paper"],
        },
        {
          ...buildArtwork("liked-similar-art"),
          artist: "Ada Artist",
          medium: "Bronze sculpture",
          tags: ["modern"],
        },
      ],
      preferencesResources: [
        { artworkId: "liked-history-art", liked: true },
        { artworkId: "disliked-history-art", liked: false },
      ],
    });

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      2,
      0,
      false,
    );

    expect(results.map((artwork) => artwork.id)).toEqual([
      "liked-similar-art",
      "disliked-similar-art",
    ]);
    expect(results[0]?.probabilityMatch).toBeGreaterThan(
      results[1]?.probabilityMatch ?? 0,
    );
  });

  it("returns live auctions and non-auctions before expired auctions", async () => {
    const service = setupService({
      primaryCandidateResources: [
        {
          id: "auction-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: true,
          endDate: futureIso(),
        },
        {
          id: "non-auction-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: false,
        },
      ],
      expiredAuctionCandidateResources: [
        {
          id: "expired-auction-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: true,
          endDate: pastIso(),
        },
      ],
      pageResources: [
        {
          ...buildArtwork("auction-art"),
          isAuction: true,
          endDate: futureIso(),
        },
        buildArtwork("non-auction-art"),
        {
          ...buildArtwork("expired-auction-art"),
          isAuction: true,
          endDate: pastIso(),
        },
      ],
    });

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      2,
      0,
      true,
    );

    expect(results.map((artwork) => artwork.id)).toEqual([
      "auction-art",
      "non-auction-art",
    ]);

    const cosmosService = (
      service as unknown as { cosmosService: { getArtworksContainer: jest.Mock } }
    ).cosmosService;
    const artworksContainer = await cosmosService.getArtworksContainer.mock
      .results[0].value;

    expect(artworksContainer.items.query.mock.calls[0][0].query).toContain(
      "c.endDate > @activeAuctionAfter",
    );
    expect(artworksContainer.items.query.mock.calls[0][0].query).toContain(
      "c.isAuction != true",
    );
    expect(
      artworksContainer.items.query.mock.calls.some((call: [{ query: string }]) =>
        call[0].query.includes("c.endDate <= @activeAuctionAfter"),
      ),
    ).toBe(false);
    expect(artworksContainer.items.query.mock.calls[1][0].query).toContain(
      "ARRAY_CONTAINS(@ids, c.id)",
    );
  });

  it("uses expired auctions only after the primary pool is exhausted", async () => {
    const service = setupService({
      primaryCandidateResources: [
        {
          id: "active-auction-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: true,
          endDate: futureIso(),
        },
      ],
      expiredAuctionCandidateResources: [
        {
          id: "expired-auction-art",
          isPrivate: false,
          uploadedBy: "owner-1",
          isAuction: true,
          endDate: pastIso(),
        },
      ],
      pageResources: [
        {
          ...buildArtwork("active-auction-art"),
          isAuction: true,
          endDate: futureIso(),
        },
        {
          ...buildArtwork("expired-auction-art"),
          isAuction: true,
          endDate: pastIso(),
        },
      ],
    });

    const results = await service.getRecommendationsForUser(
      "domain-1",
      { id: "owner-1", role: "domain_owner" },
      "customer-1",
      2,
      0,
      true,
    );

    expect(results.map((artwork) => artwork.id)).toEqual([
      "active-auction-art",
      "expired-auction-art",
    ]);

    const cosmosService = (
      service as unknown as { cosmosService: { getArtworksContainer: jest.Mock } }
    ).cosmosService;
    const artworksContainer = await cosmosService.getArtworksContainer.mock
      .results[0].value;

    expect(artworksContainer.items.query.mock.calls[0][0].query).toContain(
      "c.endDate > @activeAuctionAfter",
    );
    expect(artworksContainer.items.query.mock.calls[1][0].query).toContain(
      "c.endDate <= @activeAuctionAfter",
    );
  });
});

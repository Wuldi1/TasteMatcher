import { ArtworksService } from "./artworks.service";

const buildVector = () => Array.from({ length: 1024 }, () => 1);

const buildArtwork = (id: string) => ({
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

const setupService = () => {
  const service = new ArtworksService({} as never);

  const candidateResources = [
    {
      id: "rated-art",
      vector: buildVector(),
      isPrivate: false,
      uploadedBy: "owner-1",
      isAuction: false,
    },
    {
      id: "fresh-art",
      vector: buildVector(),
      isPrivate: false,
      uploadedBy: "owner-1",
      isAuction: false,
    },
  ];

  const candidateIterator = {
    hasMoreResults: jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false),
    fetchNext: jest.fn().mockResolvedValue({
      resources: candidateResources,
    }),
  };

  const pageIterator = {
    fetchAll: jest.fn().mockResolvedValue({
      resources: [buildArtwork("rated-art"), buildArtwork("fresh-art")],
    }),
  };

  const artworksContainer = {
    items: {
      query: jest
        .fn()
        .mockReturnValueOnce(candidateIterator)
        .mockReturnValueOnce(pageIterator),
    },
  };

  const preferencesContainer = {
    items: {
      query: jest.fn().mockReturnValue({
        fetchAll: jest.fn().mockResolvedValue({
          resources: [{ artworkId: "rated-art", liked: true, comment: "seen" }],
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
    }),
    getArtworksContainer: jest.fn().mockResolvedValue(artworksContainer),
    getArtworkPreferencesContainer: jest
      .fn()
      .mockResolvedValue(preferencesContainer),
  };

  (service as unknown as { searchIndexService: Record<string, jest.Mock> })
    .searchIndexService = {
    normalizeVector: jest.fn((vector: number[]) => vector),
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
  });
});

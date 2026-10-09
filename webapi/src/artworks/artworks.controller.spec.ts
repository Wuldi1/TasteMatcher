import { ForbiddenException } from "@nestjs/common";
import { ROLES_KEY } from "../auth/utils/roles.decorator";
import { ArtworksController } from "./artworks.controller";

describe("ArtworksController", () => {
  const mockArtworksService = {
    getRecommendationsForUser: jest.fn(),
    findOne: jest.fn(),
  };

  let controller: ArtworksController;

  beforeEach(() => {
    mockArtworksService.getRecommendationsForUser.mockReset();
    mockArtworksService.getRecommendationsForUser.mockResolvedValue([]);
    mockArtworksService.findOne.mockReset();
    mockArtworksService.findOne.mockResolvedValue({
      id: "artwork-1",
      domainId: "domain-1",
      type: "artwork",
      title: "Artwork",
    });
    controller = new ArtworksController(mockArtworksService as never);
  });

  describe("findOne", () => {
    it("passes customer visibility context to the service", async () => {
      const req = {
        user: {
          id: "customer-1",
          email: "collector@example.com",
          role: "customer",
          domainId: "domain-1",
          invitedBy: "dealer-1",
        },
      };

      await controller.findOne(req as never, "domain-1", "artwork-1");

      expect(mockArtworksService.findOne).toHaveBeenCalledWith(
        "domain-1",
        "artwork-1",
        {
          id: "customer-1",
          role: "customer",
          invitedBy: "dealer-1",
        },
      );
    });
  });

  describe("mutation authorization", () => {
    it.each(["update", "remove"] as const)(
      "restricts %s to artwork staff roles",
      (method) => {
        expect(
          Reflect.getMetadata(ROLES_KEY, ArtworksController.prototype[method]),
        ).toEqual(["global_admin", "domain_owner", "dealer"]);
      },
    );
  });

  describe("getRecommendations", () => {
    it("passes includeRated=true for owner requests", async () => {
      const req = {
        user: {
          id: "owner-1",
          role: "domain_owner",
          domainId: "domain-1",
        },
      };

      await controller.getRecommendations(
        req as never,
        "domain-1",
        "customer-1",
        "20",
        "0",
        "true",
      );

      expect(
        mockArtworksService.getRecommendationsForUser,
      ).toHaveBeenCalledWith("domain-1", req.user, "customer-1", 20, 0, true);
    });

    it("forces includeRated=false for customer requests", async () => {
      const req = {
        user: {
          id: "customer-1",
          role: "customer",
          domainId: "domain-1",
        },
      };

      await controller.getRecommendations(
        req as never,
        "domain-1",
        undefined,
        "20",
        "0",
        "true",
      );

      expect(
        mockArtworksService.getRecommendationsForUser,
      ).toHaveBeenCalledWith("domain-1", req.user, undefined, 20, 0, false);
    });

    it("keeps existing authorization guard for customer requesting other user", async () => {
      const req = {
        user: {
          id: "customer-1",
          role: "customer",
          domainId: "domain-1",
        },
      };

      await expect(
        controller.getRecommendations(
          req as never,
          "domain-1",
          "customer-2",
          "20",
          "0",
          "true",
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("preserves recommendation score details for owner responses", async () => {
      const req = {
        user: {
          id: "owner-1",
          role: "domain_owner",
          domainId: "domain-1",
        },
      };
      mockArtworksService.getRecommendationsForUser.mockResolvedValueOnce([
        {
          id: "artwork-1",
          domainId: "domain-1",
          type: "artwork",
          title: "Artwork",
          filename: "artwork.jpg",
          vector: [1, 0],
          vectorModel: "test-model",
          recommendationScore: {
            imageSimilarity: 0.9,
            intentScore: 0.8,
            metadataScore: 0.7,
            behaviorScore: 0.6,
            finalScore: 0.85,
            reasons: ["artist previously liked"],
          },
        },
      ]);

      const result = await controller.getRecommendations(
        req as never,
        "domain-1",
        "customer-1",
        "20",
        "0",
        "true",
      );

      expect(result[0]).toEqual(
        expect.objectContaining({
          recommendationScore: expect.objectContaining({
            finalScore: 0.85,
            reasons: ["artist previously liked"],
          }),
        }),
      );
      expect(result[0]).not.toHaveProperty("vector");
      expect(result[0]).not.toHaveProperty("vectorModel");
    });

    it("strips recommendation score details for customer responses", async () => {
      const req = {
        user: {
          id: "customer-1",
          role: "customer",
          domainId: "domain-1",
        },
      };
      mockArtworksService.getRecommendationsForUser.mockResolvedValueOnce([
        {
          id: "artwork-1",
          domainId: "domain-1",
          type: "artwork",
          title: "Artwork",
          filename: "artwork.jpg",
          vector: [1, 0],
          vectorModel: "test-model",
          recommendationScore: {
            imageSimilarity: 0.9,
            intentScore: 0.8,
            metadataScore: 0.7,
            behaviorScore: 0.6,
            finalScore: 0.85,
            reasons: ["artist previously liked"],
          },
        },
      ]);

      const result = await controller.getRecommendations(
        req as never,
        "domain-1",
        undefined,
        "20",
        "0",
        "true",
      );

      expect(result[0]).not.toHaveProperty("recommendationScore");
      expect(result[0]).not.toHaveProperty("vector");
      expect(result[0]).not.toHaveProperty("vectorModel");
    });
  });
});

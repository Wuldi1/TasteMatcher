import { ForbiddenException } from "@nestjs/common";
import { ArtworksController } from "./artworks.controller";

describe("ArtworksController", () => {
  const mockArtworksService = {
    getRecommendationsForUser: jest.fn(),
  };

  let controller: ArtworksController;

  beforeEach(() => {
    mockArtworksService.getRecommendationsForUser.mockReset();
    mockArtworksService.getRecommendationsForUser.mockResolvedValue([]);
    controller = new ArtworksController(mockArtworksService as never);
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

      expect(mockArtworksService.getRecommendationsForUser).toHaveBeenCalledWith(
        "domain-1",
        req.user,
        "customer-1",
        20,
        0,
        true,
      );
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

      expect(mockArtworksService.getRecommendationsForUser).toHaveBeenCalledWith(
        "domain-1",
        req.user,
        undefined,
        20,
        0,
        false,
      );
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
  });
});

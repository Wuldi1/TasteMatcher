import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UsersController } from "./users.controller";

describe("UsersController", () => {
  const mockUsersService = {
    getAllCustomerRequests: jest.fn(),
    inviteCustomerRequest: jest.fn(),
    findAllInDomain: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    addComment: jest.fn(),
    remove: jest.fn(),
    inviteUser: jest.fn(),
    sendBulkCustomerEmail: jest.fn(),
    updateQuestionnaire: jest.fn(),
    completeOnboarding: jest.fn(),
    skipOnboarding: jest.fn(),
    vectorizePreferenceImage: jest.fn(),
    finalizePreferenceVectors: jest.fn(),
  };
  const mockAuthService = {
    generateUserToken: jest.fn(),
  };
  const mockArtworksService = {
    getStats: jest.fn(),
  };

  let controller: UsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(
      mockUsersService as never,
      mockAuthService as never,
      mockArtworksService as never,
    );
  });

  it("uses the authenticated user context for stats", async () => {
    mockArtworksService.getStats.mockResolvedValue({
      totalArtworks: 10,
      totalLikes: 4,
      totalDislikes: 1,
      totalSwiped: 5,
      recentlyAdded: 2,
    });

    await controller.getUserStats({
      user: {
        id: "user-1",
        domainId: "domain-1",
      },
    } as never);

    expect(mockArtworksService.getStats).toHaveBeenCalledWith(
      "domain-1",
      "user-1",
    );
  });

  it("rejects cross-domain lookups for non-admin users", async () => {
    await expect(
      controller.findOne(
        {
          user: {
            id: "owner-1",
            role: "domain_owner",
            domainId: "domain-1",
          },
        } as never,
        "user-2",
        "domain-2",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires comment text", async () => {
    await expect(
      controller.addComment(
        {
          user: {
            id: "user-1",
            role: "customer",
            domainId: "domain-1",
          },
        } as never,
        "user-1",
        "",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents customers from commenting on other users", async () => {
    await expect(
      controller.addComment(
        {
          user: {
            id: "user-1",
            role: "customer",
            domainId: "domain-1",
          },
        } as never,
        "user-2",
        "hello",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("defaults invite domainId to the caller domain", async () => {
    mockUsersService.inviteUser.mockResolvedValue({ id: "user-9" });
    const inviteDto = {
      name: "Buyer",
      email: "buyer@example.com",
      role: "customer",
      domainId: "",
    };

    await controller.invite(
      {
        user: {
          id: "dealer-1",
          role: "dealer",
          domainId: "domain-1",
        },
      } as never,
      inviteDto as never,
    );

    expect(mockUsersService.inviteUser).toHaveBeenCalledWith(
      "domain-1",
      expect.objectContaining({ domainId: "domain-1" }),
      "dealer-1",
    );
  });

  it("prevents dealers from inviting non-customers", async () => {
    await expect(
      controller.invite(
        {
          user: {
            id: "dealer-1",
            role: "dealer",
            domainId: "domain-1",
          },
        } as never,
        {
          name: "Another Dealer",
          email: "dealer@example.com",
          role: "dealer",
          domainId: "domain-1",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

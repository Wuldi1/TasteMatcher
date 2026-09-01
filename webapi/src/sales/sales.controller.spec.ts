import { ForbiddenException } from "@nestjs/common";
import { SalesController } from "./sales.controller";

describe("SalesController", () => {
  const mockSalesService = {
    findAll: jest.fn(),
    getProposal: jest.fn(),
    createProposal: jest.fn(),
    generateAIDraft: jest.fn(),
    getAIDraftEligibility: jest.fn(),
    recordCustomerEngagement: jest.fn(),
    updateProposal: jest.fn(),
    removeProposal: jest.fn(),
    pingCustomer: jest.fn(),
  };

  let controller: SalesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SalesController(mockSalesService as never);
  });

  it("forces customers to list only their own proposals", async () => {
    mockSalesService.findAll.mockResolvedValue([]);
    const req = {
      user: {
        id: "customer-1",
        role: "customer",
        domainId: "domain-1",
      },
    };

    await controller.listProposals(
      req as never,
      "domain-1",
      "customer-1",
      "dealer-9",
    );

    expect(mockSalesService.findAll).toHaveBeenCalledWith(
      "domain-1",
      "customer-1",
      undefined,
      false,
    );
  });

  it("forces dealers to list only proposals they manage", async () => {
    mockSalesService.findAll.mockResolvedValue([]);
    const req = {
      user: {
        id: "dealer-1",
        role: "dealer",
        domainId: "domain-1",
      },
    };

    await controller.listProposals(
      req as never,
      "domain-1",
      "customer-9",
      "dealer-9",
    );

    expect(mockSalesService.findAll).toHaveBeenCalledWith(
      "domain-1",
      undefined,
      "dealer-1",
      true,
    );
  });

  it("blocks customers from viewing draft proposals", async () => {
    mockSalesService.getProposal.mockResolvedValue({
      id: "proposal-1",
      userId: "customer-1",
      status: "draft",
    });

    await expect(
      controller.getProposal(
        {
          user: {
            id: "customer-1",
            role: "customer",
            domainId: "domain-1",
          },
        } as never,
        "domain-1",
        "proposal-1",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("generates AI proposal drafts for authorized sellers", async () => {
    mockSalesService.generateAIDraft.mockResolvedValue({
      userId: "customer-1",
      items: [],
      metadata: {},
      generalComments: [],
      status: "draft",
    });

    await controller.generateAIProposalDraft(
      {
        user: {
          id: "dealer-1",
          role: "dealer",
          domainId: "domain-1",
        },
      } as never,
      "domain-1",
      { userId: "customer-1", limit: 8 },
    );

    expect(mockSalesService.generateAIDraft).toHaveBeenCalledWith(
      "domain-1",
      "customer-1",
      expect.objectContaining({ id: "dealer-1" }),
      8,
    );
  });

  it("returns AI proposal readiness for authorized sellers", async () => {
    mockSalesService.getAIDraftEligibility.mockResolvedValue({
      userId: "customer-1",
      isEligible: false,
      reasons: ["No active auction matches"],
    });

    await controller.getAIProposalEligibility(
      {
        user: {
          id: "dealer-1",
          role: "dealer",
          domainId: "domain-1",
        },
      } as never,
      "domain-1",
      "customer-1",
    );

    expect(mockSalesService.getAIDraftEligibility).toHaveBeenCalledWith(
      "domain-1",
      "customer-1",
      expect.objectContaining({ id: "dealer-1" }),
    );
  });

  it("records customer engagement for their submitted proposal", async () => {
    mockSalesService.recordCustomerEngagement.mockResolvedValue({
      id: "proposal-1",
    });

    await controller.recordProposalEngagement(
      {
        user: {
          id: "customer-1",
          role: "customer",
          domainId: "domain-1",
        },
      } as never,
      "domain-1",
      "proposal-1",
      { event: "opened" },
    );

    expect(mockSalesService.recordCustomerEngagement).toHaveBeenCalledWith(
      "domain-1",
      "proposal-1",
      expect.objectContaining({ id: "customer-1" }),
      { event: "opened" },
    );
  });
});

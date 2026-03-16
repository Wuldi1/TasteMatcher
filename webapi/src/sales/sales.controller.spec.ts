import { ForbiddenException } from "@nestjs/common";
import { SalesController } from "./sales.controller";

describe("SalesController", () => {
  const mockSalesService = {
    findAll: jest.fn(),
    getProposal: jest.fn(),
    createProposal: jest.fn(),
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
});

import { ForbiddenException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DomainsController } from "./domains.controller";

const normalizePath = (path: string) => path.replace(/:[^/]+/g, ":param");

describe("DomainsController", () => {
  const mockDomainsService = {
    findDomainById: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createOrResendDomain: jest.fn(),
    getAllDomainRequests: jest.fn(),
  };
  const mockDomainActivityService = {
    getSummary: jest.fn(),
  };

  let controller: DomainsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DomainsController(
      mockDomainsService as never,
      mockDomainActivityService as never,
    );
  });

  it("blocks non-admin users from reading another domain", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "domain_owner",
        domainId: "domain-1",
      },
    };

    await expect(
      controller.getDomain(req as never, "domain-2"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("uses the fixed 7-day window for activity summaries", async () => {
    mockDomainActivityService.getSummary.mockResolvedValue({
      byDay: [],
      totals: {},
    });

    await controller.getActivitySummary(
      {
        user: {
          id: "admin-1",
          role: "global_admin",
          domainId: "ignored",
        },
      } as never,
      "domain-9",
    );

    expect(mockDomainActivityService.getSummary).toHaveBeenCalledWith(
      "domain-9",
      7,
    );
  });

  it("does not register duplicate normalized GET routes", () => {
    const prototype = DomainsController.prototype as unknown as Record<
      string,
      object
    >;
    const signatures = Object.getOwnPropertyNames(prototype)
      .filter((methodName) => methodName !== "constructor")
      .map((methodName) => {
        const handler = prototype[methodName];
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        const path = Reflect.getMetadata(PATH_METADATA, handler);

        return {
          signature: `${method}:${normalizePath(path ?? "")}`,
          method,
        };
      })
      .filter((entry) => entry.method === RequestMethod.GET)
      .map((entry) => entry.signature);

    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

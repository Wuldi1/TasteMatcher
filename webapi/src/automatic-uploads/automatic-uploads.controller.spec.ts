import { ForbiddenException } from "@nestjs/common";
import { ROLES_KEY } from "../auth/utils/roles.decorator";
import { AutomaticUploadsController } from "./automatic-uploads.controller";

describe("AutomaticUploadsController", () => {
  const service = {
    preview: jest.fn().mockResolvedValue({ drafts: [] }),
    previewImportFile: jest.fn().mockReturnValue({ drafts: [] }),
    approve: jest
      .fn()
      .mockResolvedValue({ created: [], skipped: [], failed: [] }),
  };
  const controller = new AutomaticUploadsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it("declares the owner/admin role allowlist", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AutomaticUploadsController)).toEqual([
      "domain_owner",
      "global_admin",
    ]);
  });

  it("rejects a domain owner targeting another domain", async () => {
    const req = {
      user: {
        id: "owner-1",
        email: "owner@example.test",
        role: "domain_owner",
        domainId: "domain-1",
      },
    };
    expect(() =>
      controller.preview(req as never, "domain-2", {
        url: "https://www.phillips.com/auction/NY030826",
      }),
    ).toThrow(ForbiddenException);
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("allows a global admin to target another domain", async () => {
    const req = {
      user: {
        id: "admin-1",
        email: "admin@example.test",
        role: "global_admin",
        domainId: "admin-domain",
      },
    };
    await controller.preview(req as never, "domain-2", {
      url: "https://www.phillips.com/auction/NY030826",
    });
    expect(service.preview).toHaveBeenCalledWith(
      "domain-2",
      req.user,
      expect.any(Object),
    );
  });

  it("passes import files through the same domain access check", () => {
    const req = {
      user: {
        id: "owner-1",
        email: "owner@example.test",
        role: "domain_owner",
        domainId: "domain-1",
      },
    };

    controller.previewImportFile(req as never, "domain-1", {
      originalname: "auction-import.json",
    } as Express.Multer.File);

    expect(service.previewImportFile).toHaveBeenCalledWith(
      "domain-1",
      req.user,
      expect.objectContaining({ originalname: "auction-import.json" }),
    );
  });
});

import { ForbiddenException } from "@nestjs/common";
import { ROLES_KEY } from "../auth/utils/roles.decorator";
import { UploadController } from "./upload.controller";

describe("UploadController authorization", () => {
  const uploadService = {
    uploadManualArtwork: jest.fn(),
    replaceArtworkImage: jest.fn(),
  };
  const controller = new UploadController(uploadService as never);

  it.each(["uploadArtwork", "replaceArtworkImage"] as const)(
    "restricts %s to artwork staff roles",
    (method) => {
      expect(
        Reflect.getMetadata(ROLES_KEY, UploadController.prototype[method]),
      ).toEqual(["global_admin", "domain_owner", "dealer"]);
    },
  );

  it("rejects a staff user attempting to upload into another domain", async () => {
    const req = {
      user: {
        id: "dealer-1",
        email: "dealer@example.com",
        domainId: "domain-1",
        role: "dealer",
      },
    };

    await expect(
      controller.uploadArtwork(
        req as never,
        "domain-2",
        { buffer: Buffer.from("image"), mimetype: "image/jpeg", size: 5 },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(uploadService.uploadManualArtwork).not.toHaveBeenCalled();
  });
});

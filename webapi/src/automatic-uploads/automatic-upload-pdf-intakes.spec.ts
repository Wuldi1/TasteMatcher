import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  AutomaticUploadPdfIntakeDetail,
  AutomaticUploadPreviewResponse,
} from "@tastematcher/common";
import { ROLES_KEY } from "../auth/utils/roles.decorator";
import {
  AutomaticUploadPdfIntakesController,
  AutomaticUploadPdfIntakesInternalController,
} from "./automatic-upload-pdf-intakes.controller";
import { AutomaticUploadPdfIntakesService } from "./automatic-upload-pdf-intakes.service";

const preview: AutomaticUploadPreviewResponse = {
  provider: "import_file",
  source: {
    provider: "import_file",
    sourceAuctionUrl: "import-file:trusted",
  },
  issues: [],
  drafts: [
    {
      draftId: "lot-1",
      included: true,
      issues: [],
      source: {
        identity: {
          provider: "import_file",
          sourceAuctionUrl: "import-file:trusted",
          sourceLotNumber: "1",
        },
        sourceImageDataUrl: "data:image/jpeg;base64,AA==",
        pricingConversionStatus: "not_required",
      },
      artwork: {
        title: "Trusted title",
        artist: "Trusted artist",
        description: "",
        isAuction: true,
        shouldDisplayPrice: false,
        useForTaster: true,
        isPrivate: false,
        tags: [],
      },
    },
  ],
};

describe("AutomaticUploadPdfIntakesController", () => {
  const service = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    downloadSource: jest.fn(),
    approve: jest.fn(),
    ingest: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("allows only domain owners at the role guard boundary", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AutomaticUploadPdfIntakesController),
    ).toEqual(["domain_owner"]);
  });

  it("rejects another domain and global administrators", () => {
    const controller = new AutomaticUploadPdfIntakesController(
      service as never,
    );
    expect(() =>
      controller.list(
        {
          user: {
            id: "admin",
            email: "admin@example.test",
            role: "global_admin",
            domainId: "domain-1",
          },
        } as never,
        "domain-1",
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.list(
        {
          user: {
            id: "owner",
            email: "owner@example.test",
            role: "domain_owner",
            domainId: "domain-1",
          },
        } as never,
        "domain-2",
      ),
    ).toThrow(ForbiddenException);
  });

  it("rejects an invalid machine API key", () => {
    process.env.AUTOMATIC_UPLOAD_INTAKE_API_KEY = "expected-key";
    const controller = new AutomaticUploadPdfIntakesInternalController(
      service as never,
    );
    expect(() => controller.ingest("wrong-key", {}, {})).toThrow(
      UnauthorizedException,
    );
  });
});

describe("AutomaticUploadPdfIntakesService approval", () => {
  it("uses trusted stored source data while preserving owner artwork edits", async () => {
    const automaticUploads = {
      approve: jest.fn().mockResolvedValue({
        created: [],
        skipped: [],
        failed: [],
      }),
    };
    const service = new AutomaticUploadPdfIntakesService(
      automaticUploads as never,
      {} as never,
      {} as never,
    );
    const detail: AutomaticUploadPdfIntakeDetail = {
      id: "intake-1",
      domainId: "domain-1",
      status: "ready_for_review",
      source: {
        senderEmail: "jaclynlavy@gmail.com",
        gmailMessageId: "message-1",
        originalFilename: "auction.pdf",
      },
      summary: {
        artworkCount: 1,
        includedCount: 1,
        excludedCount: 0,
        warningCount: 0,
        missing: { title: 0, artist: 0, price: 0, endDate: 0, image: 0 },
      },
      createdAt: "2026-10-09T10:00:00.000Z",
      updatedAt: "2026-10-09T10:00:00.000Z",
      preview,
    };
    jest.spyOn(service, "get").mockResolvedValue(detail);
    jest
      .spyOn(
        service as unknown as { updateStatus: () => Promise<void> },
        "updateStatus",
      )
      .mockResolvedValue();
    const editedArtwork = { ...preview.drafts[0].artwork, title: "Owner edit" };

    await service.approve(
      "domain-1",
      "intake-1",
      {
        id: "owner-1",
        email: "owner@example.test",
        role: "domain_owner",
        domainId: "domain-1",
      },
      {
        provider: "import_file",
        sourceUrl: "import-file:forged",
        drafts: [
          {
            draftId: "lot-1",
            artwork: editedArtwork,
            source: {
              identity: {
                provider: "import_file",
                sourceAuctionUrl: "import-file:forged",
                sourceLotNumber: "999",
              },
            },
          },
        ],
      },
    );

    expect(automaticUploads.approve).toHaveBeenCalledWith(
      "domain-1",
      expect.objectContaining({ id: "owner-1" }),
      expect.objectContaining({
        sourceUrl: "import-file:trusted",
        drafts: [
          expect.objectContaining({
            draftId: "lot-1",
            source: preview.drafts[0].source,
            artwork: editedArtwork,
          }),
        ],
      }),
    );
  });
});

describe("AutomaticUploadPdfIntakesService ingestion", () => {
  it("stores private artifacts under the configured domain and persists metadata", async () => {
    process.env.AUTOMATIC_UPLOAD_INTAKE_DOMAIN_ID = "domain-1";
    process.env.AUTOMATIC_UPLOAD_INTAKE_SENDER = "jaclynlavy@gmail.com";
    const create = jest.fn().mockResolvedValue({});
    const container = {
      items: {
        query: jest.fn().mockReturnValue({
          fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
        }),
        create,
      },
    };
    const blobService = {
      uploadPrivateBlob: jest.fn().mockResolvedValue("stored"),
    };
    const automaticUploads = {
      previewImportFile: jest.fn().mockReturnValue(preview),
    };
    const service = new AutomaticUploadPdfIntakesService(
      automaticUploads as never,
      blobService as never,
      { getContainer: jest.fn().mockResolvedValue(container) } as never,
    );
    const importBuffer = Buffer.from('{"version":1}', "utf8");

    const result = await service.ingest(
      {
        senderEmail: "jaclynlavy@gmail.com",
        gmailMessageId: "message-1",
        gmailThreadId: "thread-1",
        originalFilename: "auction.pdf",
        summary: JSON.stringify({
          artworkCount: 1,
          includedCount: 1,
          excludedCount: 0,
          warningCount: 0,
          missing: {},
        }),
      },
      {
        originalname: "auction.pdf",
        mimetype: "application/pdf",
        size: 4,
        buffer: Buffer.from("%PDF"),
      },
      {
        originalname: "auction.json",
        mimetype: "application/json",
        size: importBuffer.length,
        buffer: importBuffer,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({ status: "ready_for_review", duplicate: false }),
    );
    expect(blobService.uploadPrivateBlob).toHaveBeenCalledTimes(3);
    expect(blobService.uploadPrivateBlob).toHaveBeenCalledWith(
      "automatic-upload-pdf-intakes",
      expect.stringMatching(
        /^domains\/domain-1\/pdf-intakes\/.+\/source\.pdf$/u,
      ),
      expect.any(Buffer),
      "application/pdf",
      expect.objectContaining({ domainId: "domain-1" }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "domain-1",
        status: "ready_for_review",
        source: expect.objectContaining({
          senderEmail: "jaclynlavy@gmail.com",
          gmailMessageId: "message-1",
        }),
      }),
    );
  });
});

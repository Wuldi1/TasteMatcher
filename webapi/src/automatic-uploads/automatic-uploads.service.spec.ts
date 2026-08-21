import { BadRequestException } from "@nestjs/common";
import {
  ApprovedPhillipsAutomaticUploadDraft,
  AutomaticUploadPreviewResponse,
} from "@tastematcher/common";
import { ArtworkIngestionError } from "../upload/upload.service";
import {
  AutomaticUploadsService,
  PREVIEW_DETAIL_BUDGET_MS,
} from "./automatic-uploads.service";
import { RemoteFetchError } from "./safe-remote-fetcher";

describe("AutomaticUploadsService", () => {
  const fetcher = {
    validateSourceUrl: jest.fn((value: string) => new URL(value)),
    validateImageUrl: jest.fn((value: string) => new URL(value)),
    fetchHtml: jest.fn(),
    fetchImage: jest.fn(),
  };
  const provider = {
    provider: "phillips" as const,
    displayName: "Phillips",
    canParse: jest.fn().mockReturnValue(true),
    parse: jest.fn(),
    enrichDraftFromLotDetail: jest.fn(),
  };
  const providerRegistry = {
    findForUrl: jest.fn().mockReturnValue(provider),
    findByProvider: jest.fn().mockReturnValue(provider),
  };
  const uploadService = {
    findArtworkBySourceIdentity: jest.fn(),
    uploadAutomaticArtwork: jest.fn(),
  };
  const actor = { id: "owner-1", role: "domain_owner" as const };
  let service: AutomaticUploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher.validateSourceUrl.mockImplementation(
      (value: string) => new URL(value),
    );
    fetcher.validateImageUrl.mockImplementation(
      (value: string) => new URL(value),
    );
    fetcher.fetchHtml.mockResolvedValue({
      body: "<html></html>",
      contentType: "text/html",
      finalUrl: auctionUrl,
    });
    fetcher.fetchImage.mockImplementation(async (url: string) => ({
      body: Buffer.from("image"),
      contentType: "image/jpeg",
      finalUrl: url,
    }));
    provider.canParse.mockReturnValue(true);
    providerRegistry.findForUrl.mockReturnValue(provider);
    providerRegistry.findByProvider.mockReturnValue(provider);
    provider.parse.mockImplementation(() => previewResponse(3));
    provider.enrichDraftFromLotDetail.mockImplementation((value) => ({
      ...value,
      artwork: { ...value.artwork },
    }));
    uploadService.findArtworkBySourceIdentity.mockResolvedValue(undefined);
    uploadService.uploadAutomaticArtwork.mockImplementation(
      async (
        _domainId: string,
        _file: unknown,
        _artwork: unknown,
        _actor: unknown,
        forcedId: string,
      ) => ({ id: forcedId }),
    );
    service = new AutomaticUploadsService(
      fetcher as never,
      providerRegistry as never,
      uploadService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns all 110 verified live-page lots without truncation", async () => {
    provider.parse.mockReturnValue(previewResponse(110));
    const result = await service.preview("domain-1", actor, {
      url: auctionUrl,
    });
    expect(result.drafts).toHaveLength(110);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "preview_truncated" }),
      ]),
    );
    expect(uploadService.uploadAutomaticArtwork).not.toHaveBeenCalled();
    expect(providerRegistry.findForUrl).toHaveBeenCalledWith(
      new URL(auctionUrl),
    );
  });

  it("rejects a supported source host when no parser is registered", async () => {
    providerRegistry.findForUrl.mockReturnValueOnce(undefined);

    await expect(
      service.preview("domain-1", actor, { url: auctionUrl }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
  });

  it("rejects a preview redirect to a different provider", async () => {
    fetcher.fetchHtml.mockResolvedValue({
      body: "<html></html>",
      contentType: "text/html",
      finalUrl: "https://www.sothebys.com/auction/example",
    });
    providerRegistry.findForUrl.mockImplementation((url: URL) =>
      url.hostname === "www.phillips.com" ? provider : undefined,
    );

    await expect(
      service.preview("domain-1", actor, { url: auctionUrl }),
    ).rejects.toThrow(
      "The auction URL redirected to a different or unsupported provider.",
    );
    expect(provider.parse).not.toHaveBeenCalled();
  });

  it("rejects approval when no parser is registered for the source URL", async () => {
    providerRegistry.findForUrl.mockReturnValueOnce(undefined);

    await expect(
      service.approve("domain-1", actor, approvalFor(draft("1"))),
    ).rejects.toThrow("The approval provider does not match the auction URL.");
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(uploadService.uploadAutomaticArtwork).not.toHaveBeenCalled();
  });

  it("rejects approval when the URL parser does not match the request provider", async () => {
    providerRegistry.findForUrl.mockReturnValueOnce({
      ...provider,
      provider: "different-provider",
    });

    await expect(
      service.approve("domain-1", actor, approvalFor(draft("1"))),
    ).rejects.toThrow("The approval provider does not match the auction URL.");
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(uploadService.uploadAutomaticArtwork).not.toHaveBeenCalled();
  });

  it("rejects an approval redirect to another or unsupported provider", async () => {
    fetcher.fetchHtml.mockResolvedValue({
      body: "<html></html>",
      contentType: "text/html",
      finalUrl: "https://www.sothebys.com/auction/example",
    });
    providerRegistry.findForUrl.mockImplementation((url: URL) =>
      url.hostname === "www.phillips.com" ? provider : undefined,
    );

    await expect(
      service.approve("domain-1", actor, approvalFor(draft("1"))),
    ).rejects.toThrow(
      "The auction URL redirected to a different or unsupported provider.",
    );
    expect(provider.parse).not.toHaveBeenCalled();
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(uploadService.uploadAutomaticArtwork).not.toHaveBeenCalled();
  });

  it("caps unusually large previews at 200 drafts", async () => {
    provider.parse.mockReturnValue(previewResponse(201));
    const result = await service.preview("domain-1", actor, {
      url: auctionUrl,
    });
    expect(result.drafts).toHaveLength(200);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "preview_truncated" }),
      ]),
    );
  });

  it("enriches preview drafts from lot pages and keeps detail failures editable", async () => {
    provider.parse.mockReturnValue(previewResponse(2));
    provider.enrichDraftFromLotDetail.mockImplementation((value) => ({
      ...value,
      artwork: { ...value.artwork, date: "1998" },
    }));
    fetcher.fetchHtml.mockImplementation(async (url: string) => {
      if (url === auctionUrl) {
        return { body: "<html>auction</html>", finalUrl: url };
      }
      if (url.endsWith("/2")) {
        throw new RemoteFetchError("network_error", "detail unavailable", true);
      }
      return { body: "<html>detail</html>", finalUrl: url };
    });

    const result = await service.preview("domain-1", actor, {
      url: auctionUrl,
    });

    expect(result.drafts[0].artwork.date).toBe("1998");
    expect(result.drafts[1].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "lot_detail_unavailable",
          blocking: false,
        }),
      ]),
    );
    expect(provider.enrichDraftFromLotDetail).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling detail requests after the preview enrichment budget", async () => {
    jest.useFakeTimers();
    provider.parse.mockReturnValue(previewResponse(13));
    fetcher.fetchHtml.mockImplementation((url: string) => {
      if (url === auctionUrl) {
        return Promise.resolve({ body: "<html>auction</html>", finalUrl: url });
      }
      return new Promise((resolve) => {
        setTimeout(
          () => resolve({ body: "<html>detail</html>", finalUrl: url }),
          PREVIEW_DETAIL_BUDGET_MS / 2,
        );
      });
    });

    const preview = service.preview("domain-1", actor, { url: auctionUrl });
    await jest.advanceTimersByTimeAsync(PREVIEW_DETAIL_BUDGET_MS);
    const result = await preview;

    expect(fetcher.fetchHtml).toHaveBeenCalledTimes(13);
    expect(provider.enrichDraftFromLotDetail).toHaveBeenCalledTimes(12);
    expect(result.drafts[12].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "lot_detail_unavailable",
          blocking: false,
        }),
      ]),
    );
  });

  it("keeps malformed drafts item-level while uploading valid drafts", async () => {
    const invalid = draft("2");
    invalid.artwork.title = "x".repeat(501);

    const result = await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [draft("1"), invalid, null],
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].draftId).toBe("draft-1");
    expect(result.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draftId: "draft-2",
          code: "validation_failed",
          sourceIdentity: expect.objectContaining({
            provider: "phillips",
            sourceAuctionUrl: auctionUrl,
            sourceLotNumber: "2",
          }),
        }),
        expect.objectContaining({
          draftId: "invalid-draft-3",
          code: "validation_failed",
          sourceIdentity: expect.objectContaining({
            sourceAuctionUrl: auctionUrl,
            sourceLotNumber: "invalid-lot-3",
          }),
        }),
      ]),
    );
    expect(uploadService.uploadAutomaticArtwork).toHaveBeenCalledTimes(1);
  });

  it("accepts an approval draft without an artwork date", async () => {
    const draftWithoutDate = draft("1");
    delete draftWithoutDate.artwork.date;

    const result = await service.approve(
      "domain-1",
      actor,
      approvalFor(draftWithoutDate),
    );

    expect(result.created).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(uploadService.uploadAutomaticArtwork).toHaveBeenCalledWith(
      "domain-1",
      expect.any(Object),
      expect.objectContaining({ date: undefined }),
      actor,
      expect.any(String),
    );
  });

  it.each([null, 2024, [], {}])(
    "rejects a non-string artwork date value %#",
    async (invalidDate) => {
      const invalidDraft = draft("1") as unknown as Record<string, unknown>;
      (invalidDraft.artwork as Record<string, unknown>).date = invalidDate;

      const result = await service.approve("domain-1", actor, {
        provider: "phillips",
        sourceUrl: auctionUrl,
        drafts: [invalidDraft],
      });

      expect(result.failed).toEqual([
        expect.objectContaining({
          draftId: "draft-1",
          code: "validation_failed",
        }),
      ]);
      expect(uploadService.uploadAutomaticArtwork).not.toHaveBeenCalled();
    },
  );

  it("rejects a draft identity that does not match the approval provider", async () => {
    const invalidProviderDraft = draft("1") as unknown as Record<
      string,
      unknown
    >;
    const source = invalidProviderDraft.source as Record<string, unknown>;
    source.identity = {
      ...(source.identity as Record<string, unknown>),
      provider: "sothebys",
    };

    const result = await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [invalidProviderDraft],
    });

    expect(result.failed).toEqual([
      expect.objectContaining({
        code: "validation_failed",
        sourceIdentity: expect.objectContaining({ provider: "phillips" }),
      }),
    ]);
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
  });

  it("uses trusted source values when client audit fields are tampered", async () => {
    const baseDraft = draft("1");
    const clientDraft: ApprovedPhillipsAutomaticUploadDraft = {
      ...baseDraft,
      source: {
        ...baseDraft.source,
        sourceImageUrl: "https://assets.phillips.com/tampered.jpg",
        originalEstimateText: "USD 999999",
        originalEstimateLow: 999999,
        soldPriceText: "Sold for $999999",
        soldPriceAmount: 999999,
      },
    };

    const result = await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [clientDraft],
    });

    expect(result.created).toHaveLength(1);
    expect(fetcher.fetchImage).toHaveBeenCalledWith(
      "https://dist.phillips.com/1.jpg",
    );
    expect(uploadService.findArtworkBySourceIdentity).toHaveBeenCalledWith(
      "domain-1",
      trustedDraft("1").source.identity,
    );
    expect(uploadService.uploadAutomaticArtwork).toHaveBeenCalledWith(
      "domain-1",
      expect.any(Object),
      expect.objectContaining({
        metadata: {
          automaticUpload: expect.objectContaining({
            sourceImageUrl: "https://dist.phillips.com/1.jpg",
            originalEstimateText: "USD 100 - 200",
            originalEstimateLow: 100,
            soldPriceText: "Sold for $150",
            soldPriceAmount: 150,
          }),
        },
      }),
      actor,
      expect.any(String),
    );
    expect(result.created[0].sourceIdentity).toEqual(
      trustedDraft("1").source.identity,
    );
  });

  it("preserves reviewed USD prices while restoring trusted EUR metadata", async () => {
    const trustedPreview = previewResponse(3);
    trustedPreview.drafts[0].source = {
      ...trustedPreview.drafts[0].source,
      originalEstimateText: "EUR 3,000 - 5,000",
      originalEstimateCurrency: "EUR",
      originalEstimateLow: 3000,
      originalEstimateHigh: 5000,
      pricingConversionStatus: "converted",
    };
    provider.parse.mockReturnValue(trustedPreview);
    const reviewedDraft = draft("1");
    reviewedDraft.artwork.price = 3300;
    reviewedDraft.artwork.maxPrice = 5500;

    const result = await service.approve(
      "domain-1",
      actor,
      approvalFor(reviewedDraft),
    );

    expect(result.created).toHaveLength(1);
    expect(uploadService.uploadAutomaticArtwork).toHaveBeenCalledWith(
      "domain-1",
      expect.any(Object),
      expect.objectContaining({
        price: 3300,
        maxPrice: 5500,
        metadata: {
          automaticUpload: expect.objectContaining({
            originalEstimateText: "EUR 3,000 - 5,000",
            originalEstimateCurrency: "EUR",
            originalEstimateLow: 3000,
            originalEstimateHigh: 5000,
            pricingConversionStatus: "converted",
          }),
        },
      }),
      actor,
      expect.any(String),
    );
  });

  it("rejects a lot URL that does not match the trusted parsed lot", async () => {
    const baseDraft = draft("1");
    const clientDraft: ApprovedPhillipsAutomaticUploadDraft = {
      ...baseDraft,
      source: {
        ...baseDraft.source,
        identity: {
          ...baseDraft.source.identity,
          sourceLotUrl: "https://www.phillips.com/detail/artist/NY030826/2",
        },
      },
    };

    const result = await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [clientDraft],
    });

    expect(result.failed).toEqual([
      expect.objectContaining({
        draftId: "draft-1",
        code: "source_validation_failed",
        sourceIdentity: trustedDraft("1").source.identity,
      }),
    ]);
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
  });

  it("fetches and parses the trusted auction only once per approval", async () => {
    await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [draft("1"), draft("2"), draft("3")],
    });
    expect(fetcher.fetchHtml).toHaveBeenCalledTimes(1);
    expect(provider.parse).toHaveBeenCalledTimes(1);
  });

  it("returns created, skipped, and failed results without rolling back", async () => {
    uploadService.findArtworkBySourceIdentity.mockImplementation(
      async (_domainId: string, identity: { sourceLotNumber: string }) =>
        identity.sourceLotNumber === "2" ? { id: "existing-2" } : undefined,
    );
    fetcher.fetchImage.mockImplementation(async (url: string) => {
      if (url.endsWith("3.jpg")) {
        throw new RemoteFetchError("network_error", "image unavailable", true);
      }
      return {
        body: Buffer.from("image"),
        contentType: "image/jpeg",
        finalUrl: url,
      };
    });

    const result = await service.approve("domain-1", actor, {
      provider: "phillips",
      sourceUrl: auctionUrl,
      drafts: [draft("1"), draft("2"), draft("3")],
    });

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        draftId: "draft-2",
        reason: "already_imported",
        existingArtworkId: "existing-2",
      }),
    ]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        draftId: "draft-3",
        code: "image_download_failed",
        retryable: true,
      }),
    ]);
  });

  it("maps concurrent deterministic-ID conflicts to already imported", async () => {
    let writeCount = 0;
    uploadService.uploadAutomaticArtwork.mockImplementation(
      async (
        _domainId: string,
        _file: unknown,
        _artwork: unknown,
        _actor: unknown,
        forcedId: string,
      ) => {
        writeCount += 1;
        if (writeCount === 1) return { id: forcedId };
        throw new ArtworkIngestionError("persistence", { statusCode: 409 });
      },
    );

    const [first, second] = await Promise.all([
      service.approve("domain-1", actor, approvalFor(draft("1"))),
      service.approve("domain-1", actor, approvalFor(draft("1"))),
    ]);

    const created = [...first.created, ...second.created];
    const skipped = [...first.skipped, ...second.skipped];
    expect(created).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      reason: "already_imported",
      existingArtworkId: created[0].artworkId,
    });
    const forcedIds = uploadService.uploadAutomaticArtwork.mock.calls.map(
      (call) => call[4],
    );
    expect(new Set(forcedIds).size).toBe(1);
  });

  it("does not report a Blob conflict as an existing artwork", async () => {
    uploadService.uploadAutomaticArtwork.mockRejectedValue(
      new ArtworkIngestionError("upload", { statusCode: 409 }),
    );

    const result = await service.approve(
      "domain-1",
      actor,
      approvalFor(draft("1")),
    );

    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toEqual([
      expect.objectContaining({ draftId: "draft-1", code: "upload_failed" }),
    ]);
  });

  it("keeps approval batch-size errors envelope-level", async () => {
    await expect(
      service.approve("domain-1", actor, {
        provider: "phillips",
        sourceUrl: auctionUrl,
        drafts: Array.from({ length: 21 }, () => draft("1")),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
  });

  function approvalFor(value: ApprovedPhillipsAutomaticUploadDraft) {
    return { provider: "phillips", sourceUrl: auctionUrl, drafts: [value] };
  }

  function draft(lotNumber: string): ApprovedPhillipsAutomaticUploadDraft {
    const trusted = trustedDraft(lotNumber);
    return {
      draftId: `draft-${lotNumber}`,
      source: { ...trusted.source, identity: { ...trusted.source.identity } },
      artwork: {
        title: `Edited work ${lotNumber}`,
        description: "Edited description",
        artist: "Edited artist",
        date: "2026",
        isAuction: true,
        shouldDisplayPrice: false,
        useForTaster: true,
        isPrivate: false,
        endDate: "2026-05-01T00:00:00Z",
        tags: ["phillips"],
      },
    };
  }

  function trustedDraft(lotNumber: string) {
    return previewResponse(3).drafts[Number(lotNumber) - 1];
  }

  function previewResponse(count: number): AutomaticUploadPreviewResponse {
    return {
      provider: "phillips",
      source: {
        provider: "phillips",
        sourceAuctionUrl: auctionUrl,
      },
      drafts: Array.from({ length: count }, (_, index) => {
        const lotNumber = String(index + 1);
        return {
          draftId: `trusted-${lotNumber}`,
          source: {
            identity: {
              provider: "phillips" as const,
              sourceAuctionUrl: auctionUrl,
              sourceLotNumber: lotNumber,
              sourceLotUrl: `https://www.phillips.com/detail/artist/NY030826/${lotNumber}`,
            },
            sourceImageUrl: `https://dist.phillips.com/${lotNumber}.jpg`,
            originalEstimateText: "USD 100 - 200",
            originalEstimateCurrency: "USD",
            originalEstimateLow: 100,
            originalEstimateHigh: 200,
            soldPriceText: "Sold for $150",
            soldPriceCurrency: "USD",
            soldPriceAmount: 150,
            pricingConversionStatus: "not_required" as const,
          },
          artwork: {
            title: `Trusted work ${lotNumber}`,
            description: "",
            artist: "Trusted artist",
            date: "",
            isAuction: true,
            shouldDisplayPrice: false,
            useForTaster: true,
            isPrivate: false,
            tags: ["phillips"],
          },
          included: true,
          issues: [],
        };
      }),
      issues: [],
    };
  }
});

const auctionUrl = "https://www.phillips.com/auction/NY030826";

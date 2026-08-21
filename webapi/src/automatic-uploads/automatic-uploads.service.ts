import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ApprovedAutomaticUploadDraft,
  Artwork,
  AutomaticUploadApprovalResponse,
  AutomaticUploadArtworkDraftIssue,
  AutomaticUploadDraft,
  AutomaticUploadFailedDraftResult,
  AutomaticUploadPreviewResponse,
  AutomaticUploadSourceIdentity,
  Role,
} from "@tastematcher/common";
import { v5 as uuidv5 } from "uuid";
import { ArtworkIngestionError, UploadService } from "../upload/upload.service";
import { RemoteFetchError, SafeRemoteFetcher } from "./safe-remote-fetcher";
import {
  parseApprovalDraft,
  parseApprovalRequest,
  parsePreviewRequest,
} from "./automatic-upload.validation";
import { AutomaticUploadProviderAdapter } from "./providers/automatic-upload-provider.interface";
import { AutomaticUploadProviderRegistry } from "./providers/automatic-upload-provider.registry";

interface AutomaticUploadActor {
  id: string;
  role: Role;
}

const MAX_PREVIEW_DRAFTS = 200;
const PREVIEW_DETAIL_CONCURRENCY = 6;
export const PREVIEW_DETAIL_BUDGET_MS = 30_000;
const APPROVAL_CONCURRENCY = 3;
const AUTOMATIC_ARTWORK_NAMESPACE = "7dfbe954-b517-5c87-98d6-c647a16a9f73";

@Injectable()
export class AutomaticUploadsService {
  private readonly logger = new Logger(AutomaticUploadsService.name);

  constructor(
    private readonly fetcher: SafeRemoteFetcher,
    private readonly providerRegistry: AutomaticUploadProviderRegistry,
    private readonly uploadService: UploadService,
  ) {}

  async preview(
    domainId: string,
    actor: AutomaticUploadActor,
    body: unknown,
  ): Promise<AutomaticUploadPreviewResponse> {
    const startedAt = Date.now();
    const request = parsePreviewRequest(body);
    const sourceUrl = this.fetcher.validateSourceUrl(request.url);
    const provider = this.providerRegistry.findForUrl(sourceUrl);
    if (!provider) {
      throw new BadRequestException("This auction provider is not supported.");
    }
    const logSource = this.loggableUrl(sourceUrl);
    this.logger.log({
      action: "automaticUploads.preview.start",
      provider: provider.provider,
      domainId,
      actorId: actor.id,
      ...logSource,
    });

    try {
      const fetched = await this.fetcher.fetchHtml(sourceUrl.toString());
      this.assertFinalProvider(fetched.finalUrl, provider);
      const parsed = provider.parse(fetched.body, {
        sourceUrl: fetched.finalUrl,
      });
      this.validateParsedPreview(parsed, provider);
      if (parsed.drafts.length > MAX_PREVIEW_DRAFTS) {
        parsed.drafts = parsed.drafts.slice(0, MAX_PREVIEW_DRAFTS);
        parsed.issues.push({
          scope: "batch",
          code: "preview_truncated",
          message: `${provider.displayName} returned more than ${MAX_PREVIEW_DRAFTS} lots. Only the first ${MAX_PREVIEW_DRAFTS} are shown.`,
          severity: "warning",
          blocking: false,
        });
      }
      const detailResult = await this.enrichPreviewDrafts(
        parsed.drafts,
        provider,
      );
      parsed.drafts = detailResult.drafts;
      this.logger.log({
        action: "automaticUploads.preview.success",
        provider: provider.provider,
        domainId,
        actorId: actor.id,
        lotCount: parsed.drafts.length,
        detailEnrichedCount: detailResult.enrichedCount,
        detailFailedCount: detailResult.failedCount,
        durationMs: Date.now() - startedAt,
        ...logSource,
      });
      return parsed;
    } catch (error) {
      this.logger.warn({
        action: "automaticUploads.preview.failed",
        provider: provider.provider,
        domainId,
        actorId: actor.id,
        category:
          error instanceof RemoteFetchError ? error.code : "parse_failed",
        durationMs: Date.now() - startedAt,
        ...logSource,
      });
      throw error;
    }
  }

  private async enrichPreviewDrafts(
    drafts: readonly AutomaticUploadDraft[],
    provider: AutomaticUploadProviderAdapter,
  ): Promise<{
    drafts: AutomaticUploadDraft[];
    enrichedCount: number;
    failedCount: number;
  }> {
    const enrichDraftFromLotDetail = provider.enrichDraftFromLotDetail;
    if (!enrichDraftFromLotDetail) {
      return { drafts: [...drafts], enrichedCount: 0, failedCount: 0 };
    }
    let enrichedCount = 0;
    let failedCount = 0;
    let budgetExceededCount = 0;
    const deadline = Date.now() + PREVIEW_DETAIL_BUDGET_MS;
    const enriched = await this.mapWithConcurrency(
      drafts,
      PREVIEW_DETAIL_CONCURRENCY,
      async (draft) => {
        const lotUrl = draft.source.identity.sourceLotUrl;
        if (!lotUrl) return draft;
        if (Date.now() >= deadline) {
          failedCount += 1;
          budgetExceededCount += 1;
          return this.withDetailUnavailableIssue(
            draft,
            `The ${provider.displayName} detail enrichment time limit was reached. Review and complete the draft fields before upload.`,
          );
        }
        try {
          const detailPage = await this.fetcher.fetchHtml(lotUrl);
          const result = enrichDraftFromLotDetail.call(
            provider,
            draft,
            detailPage.body,
          );
          if (result === draft) {
            throw new Error(
              `${provider.displayName} returned no lot cataloging details.`,
            );
          }
          enrichedCount += 1;
          return result;
        } catch (error) {
          failedCount += 1;
          this.logger.warn({
            action: "automaticUploads.preview.detail.failed",
            provider: provider.provider,
            sourceLotNumber: draft.source.identity.sourceLotNumber,
            category:
              error instanceof RemoteFetchError
                ? error.code
                : "detail_parse_failed",
          });
          return this.withDetailUnavailableIssue(
            draft,
            `${provider.displayName} lot details could not be loaded. Review and complete the draft fields before upload.`,
          );
        }
      },
    );
    if (budgetExceededCount > 0) {
      this.logger.warn({
        action: "automaticUploads.preview.detail.budgetExceeded",
        provider: provider.provider,
        skippedDetailCount: budgetExceededCount,
        budgetMs: PREVIEW_DETAIL_BUDGET_MS,
      });
    }
    return { drafts: enriched, enrichedCount, failedCount };
  }

  private withDetailUnavailableIssue(
    draft: AutomaticUploadDraft,
    message: string,
  ): AutomaticUploadDraft {
    return {
      ...draft,
      issues: [
        ...draft.issues,
        {
          scope: "draft",
          code: "lot_detail_unavailable",
          message,
          severity: "warning",
          blocking: false,
        },
      ],
    };
  }

  async approve(
    domainId: string,
    actor: AutomaticUploadActor,
    body: unknown,
  ): Promise<AutomaticUploadApprovalResponse> {
    const startedAt = Date.now();
    const request = parseApprovalRequest(body);
    const sourceUrl = this.fetcher.validateSourceUrl(request.sourceUrl);
    const provider = this.providerRegistry.findForUrl(sourceUrl);
    if (!provider || provider.provider !== request.provider) {
      throw new BadRequestException(
        "The approval provider does not match the auction URL.",
      );
    }
    const logSource = this.loggableUrl(sourceUrl);
    this.logger.log({
      action: "automaticUploads.approve.start",
      provider: provider.provider,
      domainId,
      actorId: actor.id,
      lotCount: request.drafts.length,
      ...logSource,
    });

    const fetched = await this.fetcher.fetchHtml(sourceUrl.toString());
    this.assertFinalProvider(fetched.finalUrl, provider);
    const trustedPreview = provider.parse(fetched.body, {
      sourceUrl: fetched.finalUrl,
    });
    const trustedAuctionUrl = this.validateParsedPreview(
      trustedPreview,
      provider,
    );
    const trustedLots = this.indexTrustedLots(trustedPreview.drafts);
    const seen = new Set<string>();
    const results = await this.mapWithConcurrency(
      request.drafts,
      APPROVAL_CONCURRENCY,
      async (rawDraft, index) => {
        const parsed = parseApprovalDraft(
          rawDraft,
          index,
          trustedAuctionUrl.toString(),
          provider.provider,
        );
        if (!parsed.valid) {
          return this.failedResult(
            parsed.draftId,
            parsed.sourceIdentity,
            "validation_failed",
            parsed.message,
            false,
          );
        }
        const binding = this.bindTrustedDraft(
          parsed.draft,
          trustedAuctionUrl,
          trustedLots,
        );
        if (!binding.valid) {
          return this.failedResult(
            parsed.draft.draftId,
            binding.sourceIdentity,
            "source_validation_failed",
            binding.message,
            false,
          );
        }
        const key = this.identityKey(binding.draft);
        if (seen.has(key)) {
          return this.failedDraft(
            binding.draft,
            "validation_failed",
            "This source lot appears more than once in the approval batch.",
            false,
          );
        }
        seen.add(key);
        return this.approveDraft(domainId, actor, binding.draft);
      },
    );
    const response: AutomaticUploadApprovalResponse = {
      created: results.filter((result) => result.status === "created"),
      skipped: results.filter((result) => result.status === "skipped"),
      failed: results.filter((result) => result.status === "failed"),
    };
    this.logger.log({
      action: "automaticUploads.approve.complete",
      provider: provider.provider,
      domainId,
      actorId: actor.id,
      createdCount: response.created.length,
      skippedCount: response.skipped.length,
      failedCount: response.failed.length,
      durationMs: Date.now() - startedAt,
      ...logSource,
    });
    return response;
  }

  private async approveDraft(
    domainId: string,
    actor: AutomaticUploadActor,
    draft: ApprovedAutomaticUploadDraft,
  ) {
    const issues = this.validateDraft(draft);
    if (issues.some((issue) => issue.blocking)) {
      return this.failedDraft(
        draft,
        "validation_failed",
        "The draft contains fields that must be corrected before upload.",
        false,
        issues,
      );
    }

    let existing: Pick<Artwork, "id"> | undefined;
    try {
      existing = await this.uploadService.findArtworkBySourceIdentity(
        domainId,
        draft.source.identity,
      );
    } catch {
      return this.failedDraft(
        draft,
        "duplicate_check_failed",
        "The gallery could not be checked for an existing source lot.",
        true,
      );
    }
    if (existing) {
      return this.skippedDraft(draft, existing.id);
    }

    let image;
    try {
      image = await this.fetcher.fetchImage(draft.source.sourceImageUrl!);
    } catch (error) {
      return this.failedDraft(
        draft,
        "image_download_failed",
        error instanceof Error
          ? error.message
          : "The auction image could not be downloaded.",
        error instanceof RemoteFetchError ? error.retryable : true,
      );
    }

    try {
      const artworkId = this.deterministicArtworkId(
        domainId,
        draft.source.identity,
      );
      const artwork = await this.uploadService.uploadAutomaticArtwork(
        domainId,
        {
          buffer: image.body,
          mimetype: image.contentType,
          size: image.body.length,
        },
        {
          ...draft.artwork,
          metadata: {
            automaticUpload: {
              provider: draft.source.identity.provider,
              sourceAuctionUrl: draft.source.identity.sourceAuctionUrl,
              sourceLotNumber: draft.source.identity.sourceLotNumber,
              sourceLotUrl: draft.source.identity.sourceLotUrl,
              sourceImageUrl: draft.source.sourceImageUrl,
              originalEstimateText: draft.source.originalEstimateText,
              originalEstimateCurrency: draft.source.originalEstimateCurrency,
              originalEstimateLow: draft.source.originalEstimateLow,
              originalEstimateHigh: draft.source.originalEstimateHigh,
              soldPriceText: draft.source.soldPriceText,
              soldPriceCurrency: draft.source.soldPriceCurrency,
              soldPriceAmount: draft.source.soldPriceAmount,
              pricingConversionStatus: draft.source.pricingConversionStatus,
            },
          },
        },
        actor,
        artworkId,
      );
      return {
        status: "created" as const,
        draftId: draft.draftId,
        sourceIdentity: draft.source.identity,
        artworkId: artwork.id,
      };
    } catch (error) {
      const deterministicId = this.deterministicArtworkId(
        domainId,
        draft.source.identity,
      );
      if (this.isCosmosConflict(error)) {
        return this.skippedDraft(draft, deterministicId);
      }
      const code =
        error instanceof ArtworkIngestionError
          ? error.stage === "image_validation"
            ? "image_validation_failed"
            : error.stage === "persistence"
              ? "persistence_failed"
              : "upload_failed"
          : "unknown";
      return this.failedDraft(
        draft,
        code,
        error instanceof Error
          ? error.message
          : "The artwork could not be uploaded.",
        code === "upload_failed" || code === "unknown",
      );
    }
  }

  private validateDraft(
    draft: ApprovedAutomaticUploadDraft,
  ): AutomaticUploadArtworkDraftIssue[] {
    const issues: AutomaticUploadArtworkDraftIssue[] = [];
    const fieldError = (
      field: keyof ApprovedAutomaticUploadDraft["artwork"],
      code: string,
      message: string,
    ) =>
      issues.push({
        scope: "field",
        field,
        code,
        message,
        severity: "error",
        blocking: true,
      });
    if (!draft.artwork.title.trim())
      fieldError("title", "missing_title", "Title is required.");
    if (!draft.artwork.artist.trim())
      fieldError("artist", "missing_artist", "Artist is required.");
    if (
      draft.artwork.isAuction &&
      (!draft.artwork.endDate ||
        !Number.isFinite(Date.parse(draft.artwork.endDate)))
    ) {
      fieldError(
        "endDate",
        "invalid_end_date",
        "A valid auction end date is required.",
      );
    }
    if (
      draft.artwork.price !== undefined &&
      draft.artwork.maxPrice !== undefined &&
      draft.artwork.maxPrice < draft.artwork.price
    ) {
      fieldError(
        "maxPrice",
        "invalid_price_range",
        "High price must be greater than or equal to low price.",
      );
    }
    return issues;
  }

  private indexTrustedLots(
    drafts: readonly AutomaticUploadDraft[],
  ): Map<string, AutomaticUploadDraft[]> {
    const lots = new Map<string, AutomaticUploadDraft[]>();
    for (const draft of drafts) {
      const key = this.normalizeLotNumber(
        draft.source.identity.sourceLotNumber,
      );
      const matches = lots.get(key) ?? [];
      matches.push(draft);
      lots.set(key, matches);
    }
    return lots;
  }

  private bindTrustedDraft(
    clientDraft: ApprovedAutomaticUploadDraft,
    trustedAuctionUrl: URL,
    trustedLots: ReadonlyMap<string, AutomaticUploadDraft[]>,
  ):
    | { valid: true; draft: ApprovedAutomaticUploadDraft }
    | {
        valid: false;
        sourceIdentity: AutomaticUploadSourceIdentity;
        message: string;
      } {
    const requestedLotNumber = this.normalizeLotNumber(
      clientDraft.source.identity.sourceLotNumber,
    );
    const candidates = trustedLots.get(requestedLotNumber) ?? [];
    const fallbackIdentity: AutomaticUploadSourceIdentity = {
      provider: clientDraft.source.identity.provider,
      sourceAuctionUrl: trustedAuctionUrl.toString(),
      sourceLotNumber: requestedLotNumber,
    };

    let clientAuctionUrl: URL;
    try {
      clientAuctionUrl = this.fetcher.validateSourceUrl(
        clientDraft.source.identity.sourceAuctionUrl,
      );
    } catch {
      return {
        valid: false,
        sourceIdentity: candidates[0]?.source.identity ?? fallbackIdentity,
        message: "The draft auction source is invalid.",
      };
    }
    if (clientAuctionUrl.toString() !== trustedAuctionUrl.toString()) {
      return {
        valid: false,
        sourceIdentity: candidates[0]?.source.identity ?? fallbackIdentity,
        message: "The draft auction source does not match the fetched auction.",
      };
    }
    if (candidates.length === 0) {
      return {
        valid: false,
        sourceIdentity: fallbackIdentity,
        message: "The requested lot was not found in the fetched auction.",
      };
    }

    let trustedDraft: AutomaticUploadDraft | undefined;
    if (clientDraft.source.identity.sourceLotUrl) {
      let requestedLotUrl: string;
      try {
        requestedLotUrl = this.fetcher
          .validateSourceUrl(clientDraft.source.identity.sourceLotUrl)
          .toString();
      } catch {
        return {
          valid: false,
          sourceIdentity: candidates[0].source.identity,
          message: "The draft lot URL is invalid.",
        };
      }
      trustedDraft = candidates.find(
        (candidate) =>
          candidate.source.identity.sourceLotUrl === requestedLotUrl,
      );
      if (!trustedDraft) {
        return {
          valid: false,
          sourceIdentity: candidates[0].source.identity,
          message: "The draft lot URL does not match the fetched auction lot.",
        };
      }
    } else if (candidates.length === 1) {
      trustedDraft = candidates[0];
    } else {
      return {
        valid: false,
        sourceIdentity: fallbackIdentity,
        message: "The lot number is ambiguous without a matching lot URL.",
      };
    }

    try {
      if (!trustedDraft.source.sourceImageUrl) {
        throw new Error("missing image");
      }
      this.fetcher.validateImageUrl(trustedDraft.source.sourceImageUrl);
    } catch {
      return {
        valid: false,
        sourceIdentity: trustedDraft.source.identity,
        message: "The fetched auction lot has no supported provider image.",
      };
    }

    return {
      valid: true,
      draft: {
        draftId: clientDraft.draftId,
        artwork: clientDraft.artwork,
        source: trustedDraft.source,
      },
    };
  }

  private failedDraft(
    draft: ApprovedAutomaticUploadDraft,
    code: AutomaticUploadFailedDraftResult["code"],
    message: string,
    retryable: boolean,
    issues?: AutomaticUploadArtworkDraftIssue[],
  ): AutomaticUploadFailedDraftResult {
    return this.failedResult(
      draft.draftId,
      draft.source.identity,
      code,
      message,
      retryable,
      issues,
    );
  }

  private failedResult(
    draftId: string,
    sourceIdentity: AutomaticUploadSourceIdentity,
    code: AutomaticUploadFailedDraftResult["code"],
    message: string,
    retryable: boolean,
    issues?: AutomaticUploadArtworkDraftIssue[],
  ): AutomaticUploadFailedDraftResult {
    return {
      status: "failed",
      draftId,
      sourceIdentity,
      code,
      message,
      retryable,
      issues,
    };
  }

  private skippedDraft(
    draft: ApprovedAutomaticUploadDraft,
    existingArtworkId: string,
  ) {
    return {
      status: "skipped" as const,
      draftId: draft.draftId,
      sourceIdentity: draft.source.identity,
      reason: "already_imported" as const,
      message: "This source lot is already in the gallery.",
      existingArtworkId,
    };
  }

  private identityKey(draft: ApprovedAutomaticUploadDraft): string {
    const identity = draft.source.identity;
    return `${identity.provider}|${identity.sourceAuctionUrl}|${identity.sourceLotNumber}`;
  }

  private deterministicArtworkId(
    domainId: string,
    identity: AutomaticUploadSourceIdentity,
  ): string {
    return uuidv5(
      [
        domainId,
        identity.provider,
        identity.sourceAuctionUrl,
        identity.sourceLotNumber,
      ].join("\u0000"),
      AUTOMATIC_ARTWORK_NAMESPACE,
    );
  }

  private isCosmosConflict(error: unknown): boolean {
    if (
      error instanceof ArtworkIngestionError &&
      error.stage !== "persistence"
    ) {
      return false;
    }
    const originalError =
      error instanceof ArtworkIngestionError ? error.originalError : error;
    if (!this.isRecord(originalError)) return false;
    return (
      originalError.statusCode === 409 ||
      originalError.code === 409 ||
      originalError.code === "Conflict"
    );
  }

  private normalizeLotNumber(value: string): string {
    return value
      .trim()
      .replace(/^LOT\s+/i, "")
      .toLowerCase();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private assertFinalProvider(
    finalUrl: string,
    expectedProvider: AutomaticUploadProviderAdapter,
  ): void {
    const resolved = this.providerRegistry.findForUrl(
      this.fetcher.validateSourceUrl(finalUrl),
    );
    if (resolved?.provider !== expectedProvider.provider) {
      throw new BadRequestException(
        "The auction URL redirected to a different or unsupported provider.",
      );
    }
  }

  private validateParsedPreview(
    preview: AutomaticUploadPreviewResponse,
    provider: AutomaticUploadProviderAdapter,
  ): URL {
    const sourceUrl = this.fetcher.validateSourceUrl(
      preview.source.sourceAuctionUrl,
    );
    if (
      preview.provider !== provider.provider ||
      preview.source.provider !== provider.provider ||
      !provider.canParse(sourceUrl) ||
      preview.drafts.some(
        (draft) => draft.source.identity.provider !== provider.provider,
      )
    ) {
      throw new BadRequestException(
        `${provider.displayName} returned an invalid provider source identity.`,
      );
    }
    return sourceUrl;
  }

  private loggableUrl(url: URL): { sourceHost: string; sourcePath: string } {
    return { sourceHost: url.hostname, sourcePath: url.pathname };
  }

  private async mapWithConcurrency<T, R>(
    values: readonly T[],
    concurrency: number,
    worker: (value: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const run = async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(values[index], index);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
    );
    return results;
  }
}

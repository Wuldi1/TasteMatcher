import { BadRequestException } from "@nestjs/common";
import {
  ApprovedPhillipsAutomaticUploadDraft,
  AutomaticUploadEditableArtworkInput,
  AutomaticUploadPricingConversionStatus,
  AutomaticUploadPreviewRequest,
  PhillipsAutomaticUploadDraftSource,
  PhillipsAutomaticUploadSourceIdentity,
} from "@tastematcher/common";

const PRICING_STATUSES = new Set<AutomaticUploadPricingConversionStatus>([
  "not_required",
  "not_attempted",
  "converted",
  "unavailable",
  "failed",
]);

export function parsePreviewRequest(
  body: unknown,
): AutomaticUploadPreviewRequest {
  const record = requireRecord(body, "Request body");
  assertOnlyKeys(record, ["url"], "Request body");
  return { url: requireString(record.url, "url", 2_000) };
}

export function parseApprovalRequest(
  body: unknown,
): AutomaticUploadApprovalEnvelope {
  const record = requireRecord(body, "Request body");
  assertOnlyKeys(record, ["provider", "sourceUrl", "drafts"], "Request body");
  if (record.provider !== "phillips") {
    throw new BadRequestException("provider must be phillips.");
  }
  if (!Array.isArray(record.drafts) || record.drafts.length === 0) {
    throw new BadRequestException("drafts must contain at least one item.");
  }
  if (record.drafts.length > 20) {
    throw new BadRequestException("A maximum of 20 drafts may be approved.");
  }
  return {
    provider: "phillips",
    sourceUrl: requireString(record.sourceUrl, "sourceUrl", 2_000),
    drafts: record.drafts,
  };
}

export interface AutomaticUploadApprovalEnvelope {
  provider: "phillips";
  sourceUrl: string;
  drafts: unknown[];
}

export type ParsedApprovalDraft =
  | {
      valid: true;
      draft: ApprovedPhillipsAutomaticUploadDraft;
    }
  | {
      valid: false;
      draftId: string;
      sourceIdentity: PhillipsAutomaticUploadSourceIdentity;
      message: string;
    };

export function parseApprovalDraft(
  value: unknown,
  index: number,
  fallbackSourceUrl: string,
): ParsedApprovalDraft {
  try {
    return { valid: true, draft: parseDraft(value, index) };
  } catch (error) {
    return {
      valid: false,
      draftId: safeDraftId(value, index),
      sourceIdentity: safeFallbackIdentity(value, index, fallbackSourceUrl),
      message: badRequestMessage(error),
    };
  }
}

function parseDraft(
  value: unknown,
  index: number,
): ApprovedPhillipsAutomaticUploadDraft {
  const label = `drafts[${index}]`;
  const record = requireRecord(value, label);
  assertOnlyKeys(record, ["draftId", "source", "artwork"], label);
  return {
    draftId: requireString(record.draftId, `${label}.draftId`, 200),
    source: parseSource(record.source, `${label}.source`),
    artwork: parseArtwork(record.artwork, `${label}.artwork`),
  };
}

function parseSource(
  value: unknown,
  label: string,
): PhillipsAutomaticUploadDraftSource {
  const record = requireRecord(value, label);
  assertOnlyKeys(
    record,
    [
      "identity",
      "sourceImageUrl",
      "originalEstimateText",
      "originalEstimateCurrency",
      "originalEstimateLow",
      "originalEstimateHigh",
      "pricingConversionStatus",
    ],
    label,
  );
  if (
    !PRICING_STATUSES.has(
      record.pricingConversionStatus as AutomaticUploadPricingConversionStatus,
    )
  ) {
    throw new BadRequestException(
      `${label}.pricingConversionStatus is invalid.`,
    );
  }
  return {
    identity: parseIdentity(record.identity, `${label}.identity`),
    sourceImageUrl: optionalString(
      record.sourceImageUrl,
      `${label}.sourceImageUrl`,
      2_000,
    ),
    originalEstimateText: optionalString(
      record.originalEstimateText,
      `${label}.originalEstimateText`,
      500,
    ),
    originalEstimateCurrency: optionalString(
      record.originalEstimateCurrency,
      `${label}.originalEstimateCurrency`,
      10,
    ),
    originalEstimateLow: optionalNumber(
      record.originalEstimateLow,
      `${label}.originalEstimateLow`,
    ),
    originalEstimateHigh: optionalNumber(
      record.originalEstimateHigh,
      `${label}.originalEstimateHigh`,
    ),
    pricingConversionStatus:
      record.pricingConversionStatus as AutomaticUploadPricingConversionStatus,
  };
}

function parseIdentity(
  value: unknown,
  label: string,
): PhillipsAutomaticUploadSourceIdentity {
  const record = requireRecord(value, label);
  assertOnlyKeys(
    record,
    ["provider", "sourceAuctionUrl", "sourceLotNumber", "sourceLotUrl"],
    label,
  );
  if (record.provider !== "phillips") {
    throw new BadRequestException(`${label}.provider must be phillips.`);
  }
  return {
    provider: "phillips",
    sourceAuctionUrl: requireString(
      record.sourceAuctionUrl,
      `${label}.sourceAuctionUrl`,
      2_000,
    ),
    sourceLotNumber: requireString(
      record.sourceLotNumber,
      `${label}.sourceLotNumber`,
      100,
    ),
    sourceLotUrl: optionalString(
      record.sourceLotUrl,
      `${label}.sourceLotUrl`,
      2_000,
    ),
  };
}

function parseArtwork(
  value: unknown,
  label: string,
): AutomaticUploadEditableArtworkInput {
  const record = requireRecord(value, label);
  assertOnlyKeys(
    record,
    [
      "title",
      "description",
      "artist",
      "date",
      "signature",
      "medium",
      "width",
      "height",
      "depth",
      "isAuction",
      "price",
      "maxPrice",
      "shouldDisplayPrice",
      "useForTaster",
      "isPrivate",
      "endDate",
      "tags",
    ],
    label,
  );
  if (
    !Array.isArray(record.tags) ||
    record.tags.some((tag) => typeof tag !== "string")
  ) {
    throw new BadRequestException(`${label}.tags must be an array of strings.`);
  }
  if (record.tags.length > 50 || record.tags.some((tag) => tag.length > 100)) {
    throw new BadRequestException(`${label}.tags exceeds the allowed size.`);
  }
  return {
    title: requireString(record.title, `${label}.title`, 500, true),
    description: requireString(
      record.description,
      `${label}.description`,
      10_000,
      true,
    ),
    artist: requireString(record.artist, `${label}.artist`, 500, true),
    date: requireString(record.date, `${label}.date`, 200, true),
    signature: optionalString(record.signature, `${label}.signature`, 2_000),
    medium: optionalString(record.medium, `${label}.medium`, 2_000),
    width: optionalNumber(record.width, `${label}.width`),
    height: optionalNumber(record.height, `${label}.height`),
    depth: optionalNumber(record.depth, `${label}.depth`),
    isAuction: requireBoolean(record.isAuction, `${label}.isAuction`),
    price: optionalNumber(record.price, `${label}.price`),
    maxPrice: optionalNumber(record.maxPrice, `${label}.maxPrice`),
    shouldDisplayPrice: requireBoolean(
      record.shouldDisplayPrice,
      `${label}.shouldDisplayPrice`,
    ),
    useForTaster: requireBoolean(record.useForTaster, `${label}.useForTaster`),
    isPrivate: requireBoolean(record.isPrivate, `${label}.isPrivate`),
    endDate: optionalString(record.endDate, `${label}.endDate`, 100),
    tags: [...record.tags] as string[],
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(record).filter(
    (key) => !allowed.includes(key),
  );
  if (unexpected.length > 0) {
    throw new BadRequestException(
      `${label} contains unsupported field: ${unexpected[0]}.`,
    );
  }
}

function requireString(
  value: unknown,
  label: string,
  maxLength: number,
  allowEmpty: boolean = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > maxLength
  ) {
    throw new BadRequestException(`${label} must be a valid string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label, maxLength, true);
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(
      `${label} must be a non-negative finite number.`,
    );
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${label} must be a boolean.`);
  }
  return value;
}

function safeDraftId(value: unknown, index: number): string {
  if (isRecord(value)) {
    const draftId = value.draftId;
    if (
      typeof draftId === "string" &&
      draftId.trim() &&
      draftId.length <= 200
    ) {
      return draftId;
    }
  }
  return `invalid-draft-${index + 1}`;
}

function safeFallbackIdentity(
  value: unknown,
  index: number,
  fallbackSourceUrl: string,
): PhillipsAutomaticUploadSourceIdentity {
  let sourceLotNumber = `invalid-lot-${index + 1}`;
  if (isRecord(value) && isRecord(value.source)) {
    const identity = value.source.identity;
    if (isRecord(identity)) {
      const lotNumber = identity.sourceLotNumber;
      if (
        typeof lotNumber === "string" &&
        lotNumber.trim() &&
        lotNumber.length <= 100
      ) {
        sourceLotNumber = lotNumber;
      }
    }
  }
  return {
    provider: "phillips",
    sourceAuctionUrl: fallbackSourceUrl,
    sourceLotNumber,
  };
}

function badRequestMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === "string") return response;
    if (isRecord(response) && typeof response.message === "string") {
      return response.message;
    }
  }
  return "The draft payload is invalid.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

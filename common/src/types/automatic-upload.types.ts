/** Runtime provider catalog shared by URL feedback and server allowlists. */
export const AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS = [
  {
    provider: "phillips",
    displayName: "Phillips",
    sourceHosts: ["phillips.com", "www.phillips.com"],
    imageHosts: ["assets.phillips.com", "dist.phillips.com"],
    exampleUrl: "https://www.phillips.com/auction/NY030826",
  },
] as const;

export type AutomaticUploadProvider =
  (typeof AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS)[number]["provider"];

export type AutomaticUploadProviderDefinition =
  (typeof AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS)[number];

export function getAutomaticUploadProviderDefinition(
  value: string | URL,
): AutomaticUploadProviderDefinition | undefined {
  let url: URL;
  try {
    url = typeof value === "string" ? new URL(value) : value;
  } catch {
    return undefined;
  }
  const hostname = url.hostname.toLowerCase();
  return AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS.find((definition) =>
    definition.sourceHosts.some((host) => host === hostname),
  );
}

export function isAutomaticUploadProvider(
  value: unknown,
): value is AutomaticUploadProvider {
  return AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS.some(
    (definition) => definition.provider === value,
  );
}

export type AutomaticUploadPricingConversionStatus =
  | "not_required"
  | "not_attempted"
  | "converted"
  | "unavailable"
  | "failed";

/** Stable provider identity used for duplicate detection within a domain. */
export interface AutomaticUploadSourceIdentity {
  readonly provider: AutomaticUploadProvider;
  readonly sourceAuctionUrl: string;
  readonly sourceLotNumber: string;
  readonly sourceLotUrl?: string;
}

export interface PhillipsAutomaticUploadSourceIdentity
  extends AutomaticUploadSourceIdentity {
  readonly provider: "phillips";
}

/**
 * Immutable source values retained for approval-time verification and artwork
 * audit metadata. These values are never treated as editable artwork fields.
 */
export interface AutomaticUploadDraftSource {
  readonly identity: AutomaticUploadSourceIdentity;
  readonly sourceImageUrl?: string;
  readonly originalEstimateText?: string;
  readonly originalEstimateCurrency?: string;
  readonly originalEstimateLow?: number;
  readonly originalEstimateHigh?: number;
  readonly soldPriceText?: string;
  readonly soldPriceCurrency?: string;
  readonly soldPriceAmount?: number;
  readonly pricingConversionStatus: AutomaticUploadPricingConversionStatus;
}

export interface PhillipsAutomaticUploadDraftSource
  extends AutomaticUploadDraftSource {
  readonly identity: PhillipsAutomaticUploadSourceIdentity;
}

export interface AutomaticUploadSourceSummary {
  readonly provider: AutomaticUploadProvider;
  readonly sourceAuctionUrl: string;
  readonly auctionCode?: string;
  readonly auctionTitle?: string;
  readonly location?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface PhillipsAutomaticUploadSourceSummary
  extends AutomaticUploadSourceSummary {
  readonly provider: "phillips";
}

/**
 * The complete allowlist of artwork values a client may edit and approve.
 * Server-owned Artwork fields intentionally do not appear in this contract.
 */
export interface AutomaticUploadEditableArtworkInput {
  title: string;
  description: string;
  artist: string;
  date: string;
  signature?: string;
  medium?: string;
  width?: number;
  height?: number;
  depth?: number;
  isAuction: boolean;
  price?: number;
  maxPrice?: number;
  shouldDisplayPrice: boolean;
  useForTaster: boolean;
  isPrivate: boolean;
  endDate?: string;
  tags: string[];
}

export type AutomaticUploadEditableArtworkField =
  keyof AutomaticUploadEditableArtworkInput;

export type AutomaticUploadIssueSeverity = "error" | "warning" | "info";

interface AutomaticUploadIssueBase {
  code: string;
  message: string;
  severity: AutomaticUploadIssueSeverity;
  blocking: boolean;
}

export interface AutomaticUploadFieldIssue extends AutomaticUploadIssueBase {
  scope: "field";
  field: AutomaticUploadEditableArtworkField;
}

export interface AutomaticUploadDraftIssue extends AutomaticUploadIssueBase {
  scope: "draft";
}

export interface AutomaticUploadBatchIssue extends AutomaticUploadIssueBase {
  scope: "batch";
}

export type AutomaticUploadIssue =
  | AutomaticUploadFieldIssue
  | AutomaticUploadDraftIssue
  | AutomaticUploadBatchIssue;

export type AutomaticUploadArtworkDraftIssue =
  | AutomaticUploadFieldIssue
  | AutomaticUploadDraftIssue;

export interface AutomaticUploadPreviewRequest {
  url: string;
}

export interface AutomaticUploadDraft {
  draftId: string;
  source: AutomaticUploadDraftSource;
  artwork: AutomaticUploadEditableArtworkInput;
  included: boolean;
  issues: AutomaticUploadArtworkDraftIssue[];
}

export interface PhillipsAutomaticUploadDraft extends AutomaticUploadDraft {
  source: PhillipsAutomaticUploadDraftSource;
}

export interface AutomaticUploadPreviewResponse {
  provider: AutomaticUploadProvider;
  source: AutomaticUploadSourceSummary;
  drafts: AutomaticUploadDraft[];
  issues: AutomaticUploadBatchIssue[];
}

export interface PhillipsAutomaticUploadPreviewResponse
  extends AutomaticUploadPreviewResponse {
  provider: "phillips";
  source: PhillipsAutomaticUploadSourceSummary;
  drafts: PhillipsAutomaticUploadDraft[];
}

/** Only included drafts are sent for approval; inclusion remains frontend UI state. */
export interface ApprovedAutomaticUploadDraft {
  draftId: string;
  source: AutomaticUploadDraftSource;
  artwork: AutomaticUploadEditableArtworkInput;
}

export interface ApprovedPhillipsAutomaticUploadDraft
  extends ApprovedAutomaticUploadDraft {
  source: PhillipsAutomaticUploadDraftSource;
}

export interface AutomaticUploadApprovalRequest {
  provider: AutomaticUploadProvider;
  sourceUrl: string;
  drafts: ApprovedAutomaticUploadDraft[];
}

export interface PhillipsAutomaticUploadApprovalRequest
  extends AutomaticUploadApprovalRequest {
  provider: "phillips";
  drafts: ApprovedPhillipsAutomaticUploadDraft[];
}

interface AutomaticUploadDraftResultBase {
  draftId: string;
  sourceIdentity: AutomaticUploadSourceIdentity;
}

export interface AutomaticUploadCreatedDraftResult
  extends AutomaticUploadDraftResultBase {
  status: "created";
  artworkId: string;
}

export type AutomaticUploadSkipReason = "already_imported";

export interface AutomaticUploadSkippedDraftResult
  extends AutomaticUploadDraftResultBase {
  status: "skipped";
  reason: AutomaticUploadSkipReason;
  message: string;
  existingArtworkId?: string;
}

export type AutomaticUploadFailureCode =
  | "validation_failed"
  | "source_validation_failed"
  | "image_download_failed"
  | "image_validation_failed"
  | "upload_failed"
  | "vectorization_failed"
  | "persistence_failed"
  | "duplicate_check_failed"
  | "unknown";

export interface AutomaticUploadFailedDraftResult
  extends AutomaticUploadDraftResultBase {
  status: "failed";
  code: AutomaticUploadFailureCode;
  message: string;
  retryable: boolean;
  issues?: AutomaticUploadArtworkDraftIssue[];
}

export type AutomaticUploadDraftResult =
  | AutomaticUploadCreatedDraftResult
  | AutomaticUploadSkippedDraftResult
  | AutomaticUploadFailedDraftResult;

export interface AutomaticUploadApprovalResponse {
  created: AutomaticUploadCreatedDraftResult[];
  skipped: AutomaticUploadSkippedDraftResult[];
  failed: AutomaticUploadFailedDraftResult[];
}

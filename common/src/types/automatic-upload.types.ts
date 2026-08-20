/**
 * Providers supported by the automatic-upload workflow.
 *
 * Keep provider-specific request and source types discriminated by this value
 * as additional providers are introduced.
 */
export type AutomaticUploadProvider = "phillips";

export type AutomaticUploadPricingConversionStatus =
  | "not_required"
  | "not_attempted"
  | "converted"
  | "unavailable"
  | "failed";

/** Stable provider identity used for duplicate detection within a domain. */
export interface PhillipsAutomaticUploadSourceIdentity {
  readonly provider: "phillips";
  readonly sourceAuctionUrl: string;
  readonly sourceLotNumber: string;
  readonly sourceLotUrl?: string;
}

export type AutomaticUploadSourceIdentity =
  PhillipsAutomaticUploadSourceIdentity;

/**
 * Immutable source values retained for approval-time verification and artwork
 * audit metadata. These values are never treated as editable artwork fields.
 */
export interface PhillipsAutomaticUploadDraftSource {
  readonly identity: PhillipsAutomaticUploadSourceIdentity;
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

export type AutomaticUploadDraftSource = PhillipsAutomaticUploadDraftSource;

export interface PhillipsAutomaticUploadSourceSummary {
  readonly provider: "phillips";
  readonly sourceAuctionUrl: string;
  readonly auctionCode?: string;
  readonly auctionTitle?: string;
  readonly location?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export type AutomaticUploadSourceSummary =
  PhillipsAutomaticUploadSourceSummary;

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

export interface PhillipsAutomaticUploadDraft {
  draftId: string;
  source: PhillipsAutomaticUploadDraftSource;
  artwork: AutomaticUploadEditableArtworkInput;
  included: boolean;
  issues: AutomaticUploadArtworkDraftIssue[];
}

export type AutomaticUploadDraft = PhillipsAutomaticUploadDraft;

export interface PhillipsAutomaticUploadPreviewResponse {
  provider: "phillips";
  source: PhillipsAutomaticUploadSourceSummary;
  drafts: PhillipsAutomaticUploadDraft[];
  issues: AutomaticUploadBatchIssue[];
}

export type AutomaticUploadPreviewResponse =
  PhillipsAutomaticUploadPreviewResponse;

/** Only included drafts are sent for approval; inclusion remains frontend UI state. */
export interface ApprovedPhillipsAutomaticUploadDraft {
  draftId: string;
  source: PhillipsAutomaticUploadDraftSource;
  artwork: AutomaticUploadEditableArtworkInput;
}

export type ApprovedAutomaticUploadDraft =
  ApprovedPhillipsAutomaticUploadDraft;

export interface PhillipsAutomaticUploadApprovalRequest {
  provider: "phillips";
  sourceUrl: string;
  drafts: ApprovedPhillipsAutomaticUploadDraft[];
}

export type AutomaticUploadApprovalRequest =
  PhillipsAutomaticUploadApprovalRequest;

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

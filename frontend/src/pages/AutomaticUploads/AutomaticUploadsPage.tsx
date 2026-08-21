import { useEffect, useMemo, useState } from "react";
import type {
  AutomaticUploadArtworkDraftIssue,
  AutomaticUploadApprovalResponse,
  AutomaticUploadDraft,
  AutomaticUploadEditableArtworkField,
  AutomaticUploadEditableArtworkInput,
  AutomaticUploadIssue,
  AutomaticUploadPreviewResponse,
  Domain,
} from "@tastematcher/common";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  RefreshCw,
  Upload,
} from "lucide-react";
import { SearchableSelect } from "../../components/inputs/SearchableSelect";
import {
  AppInlineLoader,
  AppLoadingState,
} from "../../components/Loading/AppLoadingState";
import { useAuth } from "../../contexts/AuthContext";
import { useDomain } from "../../contexts/DomainContext";
import { apiClient } from "../../utils/api";
import {
  AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS,
  getAutomaticUploadProviderUiDefinition,
} from "./automaticUploadProviders";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100";
const labelClass = "block text-xs font-medium text-gray-600";
const APPROVAL_CHUNK_SIZE = 20;

type NumericArtworkField =
  | "width"
  | "height"
  | "depth"
  | "price"
  | "maxPrice";

type BatchBooleanArtworkField =
  | "shouldDisplayPrice"
  | "useForTaster"
  | "isPrivate";

type AuctionUrlSupport =
  | { status: "empty"; message: string }
  | { status: "invalid" | "unsupported"; message: string }
  | { status: "supported"; message: string; displayName: string };

function issueForField(
  field: AutomaticUploadEditableArtworkField,
  code: string,
  message: string,
): AutomaticUploadArtworkDraftIssue {
  return {
    scope: "field",
    field,
    code,
    message,
    severity: "error",
    blocking: true,
  };
}

/** Applies immediate client validation to fields that block approval. */
export function validateAutomaticUploadDraft(
  draft: AutomaticUploadDraft,
): AutomaticUploadArtworkDraftIssue[] {
  const issues: AutomaticUploadArtworkDraftIssue[] = [];
  const { artwork } = draft;

  if (!artwork.title.trim()) {
    issues.push(issueForField("title", "title_required", "Title is required."));
  }
  if (!artwork.artist.trim()) {
    issues.push(
      issueForField("artist", "artist_required", "Artist is required."),
    );
  }
  if (!draft.source.sourceImageUrl?.trim()) {
    issues.push({
      scope: "draft",
      code: "source_image_required",
      message: "A source image is required before this lot can be uploaded.",
      severity: "error",
      blocking: true,
    });
  }
  if (artwork.isAuction && !artwork.endDate?.trim()) {
    issues.push(
      issueForField(
        "endDate",
        "auction_end_date_required",
        "Auction end date is required.",
      ),
    );
  }

  const numericFields: Array<[NumericArtworkField, number | undefined]> = [
    ["width", artwork.width],
    ["height", artwork.height],
    ["depth", artwork.depth],
    ["price", artwork.price],
    ["maxPrice", artwork.maxPrice],
  ];
  numericFields.forEach(([field, value]) => {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      issues.push(
        issueForField(
          field,
          `${field}_non_negative`,
          `${field === "maxPrice" ? "Maximum price" : field[0].toUpperCase() + field.slice(1)} must be zero or greater.`,
        ),
      );
    }
  });
  if (
    artwork.price !== undefined &&
    artwork.maxPrice !== undefined &&
    artwork.maxPrice < artwork.price
  ) {
    issues.push(
      issueForField(
        "maxPrice",
        "max_price_below_price",
        "Maximum price must be greater than or equal to the minimum price.",
      ),
    );
  }

  return issues;
}

function getDraftIssues(
  draft: AutomaticUploadDraft,
): AutomaticUploadArtworkDraftIssue[] {
  const allIssues = [...draft.issues, ...validateAutomaticUploadDraft(draft)];
  return allIssues.filter(
    (issue, index) =>
      allIssues.findIndex(
        (candidate) =>
          candidate.code === issue.code && candidate.message === issue.message,
      ) === index,
  );
}

function withUpdatedArtworkField<
  Field extends keyof AutomaticUploadEditableArtworkInput,
>(
  draft: AutomaticUploadDraft,
  field: Field,
  value: AutomaticUploadEditableArtworkInput[Field],
): AutomaticUploadDraft {
  return {
    ...draft,
    artwork: { ...draft.artwork, [field]: value },
    issues: draft.issues.filter(
      (issue) =>
        !(
          (issue.scope === "field" &&
            (issue.field === field ||
              (field === "isAuction" && issue.field === "endDate"))) ||
          (issue.scope === "draft" && issue.code === "validation_failed")
        ),
    ),
  };
}

function toDateTimeInput(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate(),
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function fromDateTimeInput(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function getAuctionUrlSupport(value: string): AuctionUrlSupport {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      status: "empty",
      message: `Supported providers: ${AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS.map(
        (provider) => provider.displayName,
      ).join(", ")}.`,
    };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return { status: "invalid", message: "Use an HTTPS auction URL." };
    }
    if (url.username || url.password) {
      return {
        status: "invalid",
        message: "Auction URLs cannot include credentials.",
      };
    }
    if (url.port) {
      return {
        status: "invalid",
        message: "Auction URLs cannot use a non-default port.",
      };
    }
    const provider = getAutomaticUploadProviderUiDefinition(url);
    if (!provider) {
      return {
        status: "unsupported",
        message: "This auction provider is not supported yet.",
      };
    }
    return {
      status: "supported",
      displayName: provider.displayName,
      message: `Supported provider: ${provider.displayName}`,
    };
  } catch {
    return { status: "invalid", message: "Enter a valid auction URL." };
  }
}

function BatchBooleanControl({
  label,
  value,
  trueLabel,
  falseLabel,
  selectedCount,
  disabled,
  onChange,
  onApply,
}: {
  label: string;
  value: boolean;
  trueLabel: string;
  falseLabel: string;
  selectedCount: number;
  disabled: boolean;
  onChange: (value: boolean) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className={labelClass}>{label}</span>
        <div
          className="mt-1 inline-flex h-10 rounded-md border border-gray-300 bg-white p-0.5"
          role="group"
          aria-label={`${label} bulk value`}
        >
          {[
            [true, trueLabel],
            [false, falseLabel],
          ].map(([option, optionLabel]) => (
            <button
              key={String(option)}
              type="button"
              onClick={() => onChange(Boolean(option))}
              disabled={disabled}
              aria-pressed={value === option}
              className={`min-w-20 rounded px-3 text-sm font-medium ${
                value === option
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {String(optionLabel)}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onApply}
        disabled={disabled || selectedCount === 0}
        aria-label={`Apply ${label} to selected`}
        className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      >
        Apply
      </button>
    </div>
  );
}

function DraftImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-36 w-full items-center justify-center bg-gray-100 text-gray-500 sm:h-40 sm:w-36 sm:flex-none">
        <div className="text-center text-xs">
          <ImageOff className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
          Image unavailable
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title ? `${title} source` : "Artwork source"}
      className="h-36 w-full bg-gray-100 object-contain sm:h-40 sm:w-36 sm:flex-none"
      onError={() => setFailed(true)}
    />
  );
}

function IssueList({ issues }: { issues: AutomaticUploadIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Draft issues">
      {issues.map((issue) => (
        <li
          key={`${issue.code}-${issue.message}`}
          className={`flex items-start gap-1.5 text-xs ${
            issue.severity === "error" ? "text-red-700" : "text-amber-700"
          }`}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function AutomaticUploadsPage() {
  const { user } = useAuth();
  const { currentDomain } = useDomain();
  const isGlobalAdmin = user?.role === "global_admin";
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [batchEndDate, setBatchEndDate] = useState("");
  const [batchDisplayPrice, setBatchDisplayPrice] = useState(false);
  const [batchUseForTaster, setBatchUseForTaster] = useState(true);
  const [batchPrivate, setBatchPrivate] = useState(false);
  const [preview, setPreview] = useState<AutomaticUploadPreviewResponse | null>(
    null,
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const effectiveDomainId = isGlobalAdmin
    ? selectedDomainId
    : user?.domainId ?? "";
  const targetDomain = isGlobalAdmin
    ? domains.find((domain) => domain.id === selectedDomainId)
    : currentDomain;
  const targetDomainName = targetDomain?.name ?? effectiveDomainId;
  const auctionUrlSupport = useMemo(
    () => getAuctionUrlSupport(sourceUrl),
    [sourceUrl],
  );
  const previewProviderName = preview
    ? (AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS.find(
        (provider) => provider.provider === preview.provider,
      )?.displayName ?? preview.provider)
    : "Auction";

  useEffect(() => {
    if (!isGlobalAdmin) return;
    setDomainsLoading(true);
    apiClient
      .getAllDomains()
      .then((loadedDomains) => setDomains(loadedDomains))
      .catch((loadError: unknown) => {
        console.error("Automatic uploads domain load failed", {
          error: loadError,
        });
        setError("Unable to load target galleries. Try again.");
      })
      .finally(() => setDomainsLoading(false));
  }, [isGlobalAdmin]);

  const draftDetails = useMemo(
    () =>
      (preview?.drafts ?? []).map((draft) => ({
        draft,
        issues: getDraftIssues(draft),
      })),
    [preview?.drafts],
  );
  const selectedDetails = draftDetails.filter(({ draft }) => draft.included);
  const selectedCount = selectedDetails.length;
  const selectedBlockingCount = selectedDetails.filter(({ issues }) =>
    issues.some((issue) => issue.blocking),
  ).length;
  const issueCount = draftDetails.reduce(
    (total, detail) => total + detail.issues.length,
    0,
  );
  const requestActive = isPreviewing || isApproving;
  const approvalDisabled =
    requestActive ||
    !effectiveDomainId ||
    selectedCount === 0 ||
    selectedBlockingCount > 0;

  const updateDraft = (
    draftId: string,
    updater: (draft: AutomaticUploadDraft) => AutomaticUploadDraft,
  ) => {
    setPreview((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((draft) =>
              draft.draftId === draftId ? updater(draft) : draft,
            ),
          }
        : current,
    );
    setNotice(null);
  };

  const updateArtworkField = <Field extends keyof AutomaticUploadEditableArtworkInput>(
    draftId: string,
    field: Field,
    value: AutomaticUploadEditableArtworkInput[Field],
  ) => {
    updateDraft(draftId, (draft) =>
      withUpdatedArtworkField(draft, field, value),
    );
  };

  const applyBatchEndDate = () => {
    const endDate = fromDateTimeInput(batchEndDate);
    if (!endDate || selectedCount === 0) return;
    setPreview((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((draft) =>
              draft.included
                ? withUpdatedArtworkField(draft, "endDate", endDate)
                : draft,
            ),
          }
        : current,
    );
    setNotice(
      `Auction end date applied to ${selectedCount} selected ${selectedCount === 1 ? "draft" : "drafts"}.`,
    );
  };

  const applyBatchBoolean = (
    field: BatchBooleanArtworkField,
    value: boolean,
    label: string,
    valueLabel: string,
  ) => {
    if (selectedCount === 0) return;
    setPreview((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((draft) =>
              draft.included
                ? withUpdatedArtworkField(draft, field, value)
                : draft,
            ),
          }
        : current,
    );
    setNotice(
      `${label} set to ${valueLabel.toLowerCase()} for ${selectedCount} selected ${selectedCount === 1 ? "draft" : "drafts"}.`,
    );
  };

  const handlePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (auctionUrlSupport.status !== "supported") {
      setError(auctionUrlSupport.message);
      return;
    }
    if (!effectiveDomainId) {
      setError("Choose a target gallery before reviewing the auction.");
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await apiClient.previewAutomaticUploads(
        effectiveDomainId,
        { url: sourceUrl.trim() },
      );
      setPreview(response);
      setBatchEndDate(toDateTimeInput(response.source.endsAt));
      const firstDraft = response.drafts[0];
      setBatchDisplayPrice(firstDraft?.artwork.shouldDisplayPrice ?? false);
      setBatchUseForTaster(firstDraft?.artwork.useForTaster ?? true);
      setBatchPrivate(firstDraft?.artwork.isPrivate ?? false);
      if (response.drafts.length === 0) {
        setNotice("No artwork lots were found at this auction URL.");
      }
    } catch (previewError: unknown) {
      console.error("Automatic upload preview failed", { error: previewError });
      setPreview(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to review this auction. Try again.",
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApproval = async () => {
    if (approvalDisabled || !preview) return;
    setError(null);
    setNotice(null);
    setIsApproving(true);
    const selectedDrafts = preview.drafts
      .filter((draft) => draft.included)
      .map(({ draftId, source, artwork }) => ({ draftId, source, artwork }));
    const aggregate: AutomaticUploadApprovalResponse = {
      created: [],
      skipped: [],
      failed: [],
    };
    let processedCount = 0;
    let requestFailure: unknown;

    for (
      let offset = 0;
      offset < selectedDrafts.length;
      offset += APPROVAL_CHUNK_SIZE
    ) {
      const drafts = selectedDrafts.slice(offset, offset + APPROVAL_CHUNK_SIZE);
      try {
        const chunkResult = await apiClient.approveAutomaticUploads(
          effectiveDomainId,
          {
            provider: preview.provider,
            sourceUrl: preview.source.sourceAuctionUrl,
            drafts,
          },
        );
        aggregate.created.push(...chunkResult.created);
        aggregate.skipped.push(...chunkResult.skipped);
        aggregate.failed.push(...chunkResult.failed);
        processedCount += drafts.length;
      } catch (approvalError: unknown) {
        requestFailure = approvalError;
        console.error("Automatic upload approval chunk failed", {
          error: approvalError,
          processedCount,
          totalCount: selectedDrafts.length,
        });
        break;
      }
    }

    const completedIds = new Set([
      ...aggregate.created.map((item) => item.draftId),
      ...aggregate.skipped.map((item) => item.draftId),
    ]);
    const failures = new Map(
      aggregate.failed.map((item) => [item.draftId, item]),
    );
    setPreview((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts
              .filter((draft) => !completedIds.has(draft.draftId))
              .map((draft) => {
                const failure = failures.get(draft.draftId);
                if (!failure) return draft;
                const issues = failure.issues?.length
                  ? failure.issues
                  : [
                      {
                        scope: "draft" as const,
                        code: failure.code,
                        message: failure.message,
                        severity: "error" as const,
                        blocking: !failure.retryable,
                      },
                    ];
                return { ...draft, included: true, issues };
              }),
          }
        : current,
    );

    const parts = [
      aggregate.created.length
        ? `${aggregate.created.length} artwork${aggregate.created.length === 1 ? "" : "s"} uploaded.`
        : "",
      aggregate.skipped.length
        ? `${aggregate.skipped.length} already imported ${aggregate.skipped.length === 1 ? "lot was" : "lots were"} skipped.`
        : "",
      aggregate.failed.length
        ? `${aggregate.failed.length} ${aggregate.failed.length === 1 ? "lot needs" : "lots need"} attention.`
        : "",
    ].filter(Boolean);
    setNotice(parts.join(" ") || null);

    if (requestFailure) {
      const failureMessage =
        requestFailure instanceof Error
          ? requestFailure.message
          : "The server could not complete the next batch.";
      setError(
        `Upload stopped after ${processedCount} of ${selectedDrafts.length} drafts were processed. ${failureMessage}`,
      );
    }
    setIsApproving(false);
  };

  const setAllIncluded = (included: boolean) => {
    setPreview((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((draft) => ({ ...draft, included })),
          }
        : current,
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-6">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Automatic Uploads</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review supported auction lots as drafts before adding them to a gallery.
        </p>
      </header>

      <form
        onSubmit={handlePreview}
        className="border-y border-gray-200 bg-white px-4 py-4 sm:rounded-md sm:border"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)_auto] lg:items-end">
          <div>
            <label
              htmlFor="automatic-upload-source-url"
              className={labelClass}
            >
              Auction URL
            </label>
            <input
              id="automatic-upload-source-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder={AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS[0].exampleUrl}
              className={fieldClass}
              disabled={requestActive}
              aria-describedby="automatic-upload-provider-status"
            />
            <span
              id="automatic-upload-provider-status"
              aria-live="polite"
              className={`mt-1.5 flex min-h-4 items-center gap-1.5 text-xs font-normal ${
                auctionUrlSupport.status === "supported"
                  ? "text-green-700"
                  : auctionUrlSupport.status === "empty"
                    ? "text-gray-500"
                    : "text-red-700"
              }`}
            >
              {auctionUrlSupport.status === "supported" ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : auctionUrlSupport.status !== "empty" ? (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              {auctionUrlSupport.message}
            </span>
          </div>
          {isGlobalAdmin ? (
            <div>
              <label htmlFor="automatic-upload-domain" className={labelClass}>
                Target gallery
              </label>
              <SearchableSelect
                id="automatic-upload-domain"
                ariaLabel="Target gallery"
                value={selectedDomainId || undefined}
                onChange={(value) => {
                  setSelectedDomainId(value ?? "");
                  setPreview(null);
                  setNotice(null);
                }}
                options={domains.map((domain) => ({
                  value: domain.id,
                  label: domain.name,
                }))}
                placeholder={domainsLoading ? "Loading galleries..." : "Select gallery"}
                disabled={domainsLoading || requestActive}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-gray-500">
                Choose the gallery that will receive approved artwork.
              </p>
            </div>
          ) : (
            <div>
              <span className={labelClass}>Target gallery</span>
              <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {targetDomainName || "Loading gallery..."}
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={
              requestActive ||
              !effectiveDomainId ||
              auctionUrlSupport.status !== "supported"
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isPreviewing ? (
              <AppInlineLoader
                size="xs"
                theme="light"
                label="Reviewing..."
              />
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Review content
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          {notice}
        </div>
      )}
      {isPreviewing && (
        <AppLoadingState
          message="Reading auction lots and preparing drafts..."
          className="min-h-44 rounded-md border border-gray-200 bg-white"
        />
      )}

      {preview && !isPreviewing && (
        <>
          <section className="border-y border-gray-200 bg-white px-4 py-4 sm:rounded-md sm:border" aria-labelledby="source-summary-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">
                  {previewProviderName} source
                </p>
                <h2 id="source-summary-heading" className="mt-1 text-base font-semibold text-gray-900">
                  {preview.source.auctionTitle ?? preview.source.auctionCode ?? "Auction preview"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {[preview.source.location, preview.source.auctionCode]
                    .filter(Boolean)
                    .join(" · ") || "Auction details unavailable"}
                </p>
              </div>
              <a
                href={preview.source.sourceAuctionUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                Open source <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            {preview.issues.length > 0 && <div className="mt-3"><IssueList issues={preview.issues} /></div>}
          </section>

          <section className="space-y-3" aria-labelledby="drafts-heading">
            <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="drafts-heading" className="text-lg font-semibold text-gray-900">Artwork drafts</h2>
                <p className="text-sm text-gray-600">
                  {selectedCount} selected · {issueCount} issues · {selectedBlockingCount} selected drafts blocked
                </p>
              </div>
              {draftDetails.length > 0 && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllIncluded(true)} disabled={requestActive} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                    Select all
                  </button>
                  <button type="button" onClick={() => setAllIncluded(false)} disabled={requestActive} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                    Exclude all
                  </button>
                </div>
              )}
            </div>

            {draftDetails.length > 0 && (
              <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                <div className="border-b border-gray-200 bg-gray-50 px-3 py-2.5">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Bulk edit selected
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Updates {selectedCount} selected {selectedCount === 1 ? "draft" : "drafts"}.
                  </p>
                </div>
                <div className="grid divide-y divide-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-end sm:justify-between">
                    <label className={`${labelClass} min-w-0 flex-1`}>
                      Auction end date
                      <input
                        aria-label="Set auction end date for selected drafts"
                        type="datetime-local"
                        value={batchEndDate}
                        onChange={(event) => setBatchEndDate(event.target.value)}
                        disabled={requestActive}
                        className={fieldClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyBatchEndDate}
                      disabled={
                        !batchEndDate || selectedCount === 0 || requestActive
                      }
                      className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Apply to selected
                    </button>
                  </div>
                  <BatchBooleanControl
                    label="Display price"
                    value={batchDisplayPrice}
                    trueLabel="Show"
                    falseLabel="Hide"
                    selectedCount={selectedCount}
                    disabled={requestActive}
                    onChange={setBatchDisplayPrice}
                    onApply={() =>
                      applyBatchBoolean(
                        "shouldDisplayPrice",
                        batchDisplayPrice,
                        "Display price",
                        batchDisplayPrice ? "Show" : "Hide",
                      )
                    }
                  />
                </div>
                <div className="grid divide-y divide-gray-200 border-t border-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <BatchBooleanControl
                    label="Use for Taster"
                    value={batchUseForTaster}
                    trueLabel="Include"
                    falseLabel="Exclude"
                    selectedCount={selectedCount}
                    disabled={requestActive}
                    onChange={setBatchUseForTaster}
                    onApply={() =>
                      applyBatchBoolean(
                        "useForTaster",
                        batchUseForTaster,
                        "Use for Taster",
                        batchUseForTaster ? "Include" : "Exclude",
                      )
                    }
                  />
                  <BatchBooleanControl
                    label="Private"
                    value={batchPrivate}
                    trueLabel="Private"
                    falseLabel="Public"
                    selectedCount={selectedCount}
                    disabled={requestActive}
                    onChange={setBatchPrivate}
                    onApply={() =>
                      applyBatchBoolean(
                        "isPrivate",
                        batchPrivate,
                        "Privacy",
                        batchPrivate ? "Private" : "Public",
                      )
                    }
                  />
                </div>
              </div>
            )}

            {draftDetails.length === 0 ? (
              <div className="border-y border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-600 sm:rounded-md sm:border">
                No drafts remain in this batch.
              </div>
            ) : (
              draftDetails.map(({ draft, issues }) => {
                const lotNumber = draft.source.identity.sourceLotNumber;
                const blocking = issues.some((issue) => issue.blocking);
                return (
                  <article
                    key={draft.draftId}
                    data-testid={`automatic-upload-draft-${draft.draftId}`}
                    className={`overflow-hidden rounded-md border bg-white ${draft.included ? "border-gray-300" : "border-gray-200 opacity-70"}`}
                  >
                    <fieldset disabled={requestActive} className="min-w-0 border-0 p-0">
                      <legend className="sr-only">
                        Edit lot {lotNumber}
                      </legend>
                    <div className="flex flex-col sm:flex-row">
                      <DraftImage src={draft.source.sourceImageUrl} title={draft.artwork.title} />
                      <div className="min-w-0 flex-1 p-3 sm:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">Lot {lotNumber}</p>
                            <p className="mt-0.5 text-sm font-medium text-gray-900">{draft.artwork.title || "Untitled draft"}</p>
                            <p className="text-xs text-gray-500">{draft.artwork.artist || "Artist missing"}</p>
                          </div>
                          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700">
                            <input
                              type="checkbox"
                              checked={draft.included}
                              onChange={(event) => updateDraft(draft.draftId, (current) => ({ ...current, included: event.target.checked }))}
                              aria-label={`Include lot ${lotNumber}`}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600"
                            />
                            Include
                          </label>
                        </div>
                        {draft.source.originalEstimateText && (
                          <p className="mt-2 text-xs text-gray-600">Source estimate: {draft.source.originalEstimateText}</p>
                        )}
                        {issues.length > 0 && <div className="mt-3 rounded-md bg-gray-50 p-2.5"><IssueList issues={issues} /></div>}
                        {blocking && draft.included && (
                          <p className="mt-2 text-xs font-medium text-red-700">Correct these issues or exclude this lot to continue.</p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-gray-200 p-3 sm:p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className={labelClass}>Title<input aria-label="Title" value={draft.artwork.title} onChange={(event) => updateArtworkField(draft.draftId, "title", event.target.value)} className={fieldClass} /></label>
                        <label className={labelClass}>Artist<input aria-label="Artist" value={draft.artwork.artist} onChange={(event) => updateArtworkField(draft.draftId, "artist", event.target.value)} className={fieldClass} /></label>
                        <label className={labelClass}>Artwork date<input aria-label="Artwork date" value={draft.artwork.date} onChange={(event) => updateArtworkField(draft.draftId, "date", event.target.value)} className={fieldClass} /></label>
                        <label className={labelClass}>Medium<input aria-label="Medium" value={draft.artwork.medium ?? ""} onChange={(event) => updateArtworkField(draft.draftId, "medium", event.target.value || undefined)} className={fieldClass} /></label>
                        <label className={labelClass}>Signature<input aria-label="Signature" value={draft.artwork.signature ?? ""} onChange={(event) => updateArtworkField(draft.draftId, "signature", event.target.value || undefined)} className={fieldClass} /></label>
                        {(["width", "height", "depth"] as NumericArtworkField[]).map((field) => (
                          <label key={field} className={labelClass}>{field[0].toUpperCase() + field.slice(1)}<input aria-label={field[0].toUpperCase() + field.slice(1)} type="number" min="0" step="any" value={draft.artwork[field] ?? ""} onChange={(event) => updateArtworkField(draft.draftId, field, event.target.value === "" ? undefined : Number(event.target.value))} className={fieldClass} /></label>
                        ))}
                        <label className={labelClass}>Minimum price<input aria-label="Minimum price" type="number" min="0" step="any" value={draft.artwork.price ?? ""} onChange={(event) => updateArtworkField(draft.draftId, "price", event.target.value === "" ? undefined : Number(event.target.value))} className={fieldClass} /></label>
                        <label className={labelClass}>Maximum price<input aria-label="Maximum price" type="number" min="0" step="any" value={draft.artwork.maxPrice ?? ""} onChange={(event) => updateArtworkField(draft.draftId, "maxPrice", event.target.value === "" ? undefined : Number(event.target.value))} className={fieldClass} /></label>
                        <label className={`${labelClass} sm:col-span-2`}>Auction end date<input aria-label="Auction end date" type="datetime-local" value={toDateTimeInput(draft.artwork.endDate)} onChange={(event) => updateArtworkField(draft.draftId, "endDate", fromDateTimeInput(event.target.value))} disabled={!draft.artwork.isAuction} className={fieldClass} /></label>
                        <label className={`${labelClass} sm:col-span-2`}>Tags<input aria-label="Tags" value={draft.artwork.tags.join(", ")} onChange={(event) => updateArtworkField(draft.draftId, "tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} className={fieldClass} /></label>
                        <label className={`${labelClass} sm:col-span-2 lg:col-span-4`}>Description<textarea aria-label="Description" rows={2} value={draft.artwork.description} onChange={(event) => updateArtworkField(draft.draftId, "description", event.target.value)} className={fieldClass} /></label>
                      </div>
                      <fieldset className="mt-4 flex flex-wrap gap-x-5 gap-y-3 border-t border-gray-100 pt-3">
                        <legend className="sr-only">Artwork defaults</legend>
                        {([
                          ["isAuction", "Auction"],
                          ["shouldDisplayPrice", "Display price"],
                          ["useForTaster", "Use for Taster"],
                          ["isPrivate", "Private"],
                        ] as Array<["isAuction" | "shouldDisplayPrice" | "useForTaster" | "isPrivate", string]>).map(([field, label]) => (
                          <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={draft.artwork[field]} onChange={(event) => updateArtworkField(draft.draftId, field, event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </div>
                    </fieldset>
                  </article>
                );
              })
            )}
          </section>

          <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-md border border-gray-300 bg-white p-3 shadow-md sm:flex-row sm:items-center sm:justify-between md:bottom-3">
            <p className="text-sm text-gray-700">
              Upload {selectedCount} selected {selectedCount === 1 ? "artwork" : "artworks"} to <span className="font-semibold text-gray-900">{targetDomainName || "the selected gallery"}</span>.
              {selectedBlockingCount > 0 && <span className="ml-1 text-red-700">{selectedBlockingCount} selected {selectedBlockingCount === 1 ? "draft has" : "drafts have"} blocking issues.</span>}
            </p>
            <button
              type="button"
              onClick={handleApproval}
              disabled={approvalDisabled}
              className="inline-flex min-h-10 flex-none items-center justify-center gap-2 rounded-md bg-green-700 px-4 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              aria-label={`Upload ${selectedCount} selected ${selectedCount === 1 ? "artwork" : "artworks"}`}
            >
              {isApproving ? (
                <AppInlineLoader
                  size="xs"
                  theme="light"
                  label="Uploading..."
                />
              ) : (
                <>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload {selectedCount} selected
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

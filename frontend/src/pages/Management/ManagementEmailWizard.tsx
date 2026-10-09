import React, { useEffect, useMemo, useState } from "react";
import { User } from "@tastematcher/common";
import { ApiError, apiClient } from "../../utils/api";

type WizardStep = 1 | 2 | 3;
type EditorMode = "simple" | "html";

type SimpleEmailDraft = {
  logoUrl: string;
  brandName: string;
  brandTagline: string;
  sectionLabel: string;
  headline: string;
  intro: string;
  bulletTitle: string;
  bulletLines: string;
  ctaLabel: string;
  ctaUrl: string;
  closingLine1: string;
  closingLine2: string;
};

type EmailTemplate = {
  id: string;
  name: string;
  description: string;
  buildPreset: (params: { ctaUrl: string }) => {
    subject: string;
    draft: SimpleEmailDraft;
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseBulletLines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const buildSimpleEmailHtml = (draft: SimpleEmailDraft): string => {
  const bullets = parseBulletLines(draft.bulletLines)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#242a25;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffefa;border-radius:16px;overflow:hidden;border:1px solid #d9d5ca;">
            <tr>
              <td style="padding:24px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${escapeHtml(draft.logoUrl)}" alt="${escapeHtml(draft.brandName)}" width="40" height="40" style="display:block;border:0;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:10px;">
                      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;letter-spacing:0.2px;color:#242a25;">${escapeHtml(draft.brandName)}</div>
                      <div style="font-size:12px;color:#666a61;">${escapeHtml(draft.brandTagline)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 28px 0;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a6c3e;">${escapeHtml(draft.sectionLabel)}</div>
                <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:400;color:#242a25;">${escapeHtml(draft.headline)}</div>
                <div style="margin-top:10px;font-size:15px;line-height:1.7;color:#666a61;">
                  ${escapeHtml(draft.intro)}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0eee8;border:1px solid #d9d5ca;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div style="font-size:13px;font-weight:700;color:#242a25;margin-bottom:6px;">${escapeHtml(draft.bulletTitle)}</div>
                      <ul style="margin:0;padding-left:18px;color:#666a61;font-size:14px;line-height:1.6;">
                        ${bullets}
                      </ul>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 28px 0;">
                <a href="${escapeHtml(draft.ctaUrl)}" style="display:inline-block;background:#344d40;color:#fffefa;text-decoration:none;font-size:14px;font-weight:700;padding:14px 24px;letter-spacing:0.02em;">${escapeHtml(draft.ctaLabel)}</a>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px 26px;">
                <div style="font-size:13px;line-height:1.6;color:#666a61;">
                  ${escapeHtml(draft.closingLine1)}<br />
                  ${escapeHtml(draft.closingLine2)}
                </div>
                <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#666a61;">
                  <a href="https://tastematcher.art/privacy-policy" style="color:#344d40;">Privacy Policy</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://tastematcher.art/terms-of-service" style="color:#344d40;">Terms of Service</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildSimpleEmailText = (draft: SimpleEmailDraft): string => {
  const bullets = parseBulletLines(draft.bulletLines).map(
    (line) => `- ${line}`,
  );

  return [
    draft.headline,
    "",
    draft.intro,
    "",
    `${draft.bulletTitle}:`,
    ...bullets,
    "",
    `${draft.ctaLabel}: ${draft.ctaUrl}`,
    "",
    draft.closingLine1,
    draft.closingLine2,
  ].join("\n");
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "new_content_available",
    name: "New Content Available",
    description:
      "Announce newly curated artworks and drive customers back to TasteMatcher.",
    buildPreset: ({ ctaUrl }) => ({
      subject: "New artwork selections are now available on TasteMatcher",
      draft: {
        logoUrl: "https://tastematcher.art/tastematcher_icon_icon_64.png",
        brandName: "TasteMatcher",
        brandTagline: "Private art advisory",
        sectionLabel: "A New Selection",
        headline: "New works, considered for you",
        intro:
          "A considered group of new works is ready to discover. Each selection has been chosen to deepen our understanding of the art that speaks to you.",
        bulletTitle: "Inside your private gallery",
        bulletLines: [
          "New works ready to view in Taster",
          "Fresh recommendations informed by your responses",
          "A more personal view of your evolving taste",
        ].join("\n"),
        ctaLabel: "Open TasteMatcher",
        ctaUrl,
        closingLine1: "Thank you,",
        closingLine2: "The TasteMatcher Team",
      },
    }),
  },
];

const normalize = (value: string) => value.trim().toLowerCase();

export function ManagementEmailWizard({
  open,
  onClose,
  users,
  domainId,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  domainId?: string;
}) {
  const customers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.role === "customer" &&
          user.status !== "pending_verification" &&
          typeof user.email === "string" &&
          user.email.includes("@"),
      ),
    [users],
  );

  const defaultTemplate = EMAIL_TEMPLATES[0];
  const [step, setStep] = useState<WizardStep>(1);
  const [templateId, setTemplateId] = useState(defaultTemplate.id);
  const [editorMode, setEditorMode] = useState<EditorMode>("simple");
  const [subject, setSubject] = useState("");
  const [simpleDraft, setSimpleDraft] = useState<SimpleEmailDraft>(
    () =>
      defaultTemplate.buildPreset({ ctaUrl: `${window.location.origin}/login` })
        .draft,
  );
  const [htmlBody, setHtmlBody] = useState("");
  const [textBody, setTextBody] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
    [],
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    requestedRecipients: number;
  } | null>(null);

  const ctaUrl = `${window.location.origin}/login`;

  const generatedHtmlBody = useMemo(
    () => buildSimpleEmailHtml(simpleDraft),
    [simpleDraft],
  );
  const generatedTextBody = useMemo(
    () => buildSimpleEmailText(simpleDraft),
    [simpleDraft],
  );

  const effectiveHtmlBody =
    editorMode === "simple" ? generatedHtmlBody : htmlBody;
  const effectiveTextBody =
    editorMode === "simple" ? generatedTextBody : textBody.trim();

  useEffect(() => {
    if (!open) return;

    const template =
      EMAIL_TEMPLATES.find((item) => item.id === templateId) || defaultTemplate;
    const preset = template.buildPreset({ ctaUrl });

    setSubject(preset.subject);
    setSimpleDraft(preset.draft);
    setHtmlBody(buildSimpleEmailHtml(preset.draft));
    setTextBody(buildSimpleEmailText(preset.draft));
    setEditorMode("simple");
    setStep(1);
    setError(null);
    setSendResult(null);
    setSelectedRecipientIds([]);
    setRecipientQuery("");
    setIsSending(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRecipients = useMemo(() => {
    const query = normalize(recipientQuery);
    if (!query) return customers;
    return customers.filter((customer) => {
      return (
        normalize(customer.name || "").includes(query) ||
        normalize(customer.email || "").includes(query)
      );
    });
  }, [customers, recipientQuery]);

  const recipientLookup = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const selectedRecipients = useMemo(
    () =>
      selectedRecipientIds
        .map((id) => recipientLookup.get(id))
        .filter((user): user is User => Boolean(user)),
    [selectedRecipientIds, recipientLookup],
  );

  const allVisibleSelected =
    filteredRecipients.length > 0 &&
    filteredRecipients.every((recipient) =>
      selectedRecipientIds.includes(recipient.id),
    );

  const canProceedFromStep1 =
    subject.trim().length >= 3 && effectiveHtmlBody.trim().length >= 20;
  const canProceedFromStep2 = selectedRecipientIds.length > 0;

  const applyTemplate = () => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    const preset = template.buildPreset({ ctaUrl });
    setSubject(preset.subject);
    setSimpleDraft(preset.draft);
    setHtmlBody(buildSimpleEmailHtml(preset.draft));
    setTextBody(buildSimpleEmailText(preset.draft));
    setEditorMode("simple");
  };

  const updateSimpleDraft = (field: keyof SimpleEmailDraft, value: string) => {
    setSimpleDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRecipient = (userId: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const toggleVisibleRecipients = () => {
    if (allVisibleSelected) {
      setSelectedRecipientIds((prev) =>
        prev.filter(
          (id) => !filteredRecipients.some((recipient) => recipient.id === id),
        ),
      );
      return;
    }

    setSelectedRecipientIds((prev) => [
      ...new Set([
        ...prev,
        ...filteredRecipients.map((recipient) => recipient.id),
      ]),
    ]);
  };

  const handleContinue = () => {
    if (step === 1 && editorMode === "simple") {
      setHtmlBody(generatedHtmlBody);
      setTextBody(generatedTextBody);
    }
    setStep((prev) => (prev + 1) as WizardStep);
  };

  const handleSend = async () => {
    try {
      setIsSending(true);
      setError(null);

      const result = await apiClient.sendBulkCustomerEmail({
        domainId: domainId || undefined,
        recipientUserIds: selectedRecipientIds,
        subject: subject.trim(),
        htmlBody: effectiveHtmlBody,
        textBody: effectiveTextBody || undefined,
        templateId,
      });

      setSendResult({
        sent: result.sent,
        failed: result.failed,
        requestedRecipients: result.requestedRecipients,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to send campaign emails.",
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="campaign-studio fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 sm:p-4">
      <div className="campaign-studio__positioner mx-auto flex min-h-[100dvh] max-w-6xl items-start justify-center py-2 sm:items-center sm:py-4">
        <div className="campaign-studio__surface w-full max-h-[calc(100dvh-1rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl sm:max-h-[94dvh]">
          <div className="campaign-studio__header flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Customer Email Campaign
              </h2>
              <p className="text-sm text-gray-500">
                {step === 1
                  ? "Compose"
                  : step === 2
                    ? "Recipients"
                    : "Review & send"}{" "}
                · Step {step} of 3
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="campaign-studio__body max-h-[calc(100dvh-9.75rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(94dvh-150px)] sm:px-6 sm:py-5">
            {step === 1 && (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Template
                    </label>
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {EMAIL_TEMPLATES.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {
                        EMAIL_TEMPLATES.find((item) => item.id === templateId)
                          ?.description
                      }
                    </p>
                    <button
                      type="button"
                      onClick={applyTemplate}
                      className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Apply Template
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Subject
                    </label>
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Email subject"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Editor Mode
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditorMode("simple")}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          editorMode === "simple"
                            ? "bg-blue-600 text-white"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        Simple Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode("html")}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          editorMode === "html"
                            ? "bg-blue-600 text-white"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        Advanced HTML
                      </button>
                    </div>
                  </div>

                  {editorMode === "simple" ? (
                    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                      <p className="text-xs text-blue-800">
                        No HTML required. Edit the content fields below and we
                        will generate the email design automatically.
                      </p>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Headline
                        </label>
                        <input
                          value={simpleDraft.headline}
                          onChange={(event) =>
                            updateSimpleDraft("headline", event.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Intro Text
                        </label>
                        <textarea
                          value={simpleDraft.intro}
                          onChange={(event) =>
                            updateSimpleDraft("intro", event.target.value)
                          }
                          className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Update Bullets (one per line)
                        </label>
                        <textarea
                          value={simpleDraft.bulletLines}
                          onChange={(event) =>
                            updateSimpleDraft("bulletLines", event.target.value)
                          }
                          className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            CTA Label
                          </label>
                          <input
                            value={simpleDraft.ctaLabel}
                            onChange={(event) =>
                              updateSimpleDraft("ctaLabel", event.target.value)
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            CTA URL
                          </label>
                          <input
                            value={simpleDraft.ctaUrl}
                            onChange={(event) =>
                              updateSimpleDraft("ctaUrl", event.target.value)
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Closing Line 1
                          </label>
                          <input
                            value={simpleDraft.closingLine1}
                            onChange={(event) =>
                              updateSimpleDraft(
                                "closingLine1",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Closing Line 2
                          </label>
                          <input
                            value={simpleDraft.closingLine2}
                            onChange={(event) =>
                              updateSimpleDraft(
                                "closingLine2",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          HTML Body
                        </label>
                        <textarea
                          value={htmlBody}
                          onChange={(event) => setHtmlBody(event.target.value)}
                          className="h-56 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Plain Text Body (Optional)
                        </label>
                        <p className="mb-1 text-xs text-gray-500">
                          This version is used by email clients that block HTML
                          and can improve deliverability/accessibility.
                        </p>
                        <textarea
                          value={textBody}
                          onChange={(event) => setTextBody(event.target.value)}
                          className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Live Preview
                  </label>
                  <div className="max-h-[720px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <iframe
                      title="Campaign email preview"
                      sandbox=""
                      srcDoc={effectiveHtmlBody}
                      className="h-[680px] w-full rounded-lg border-0 bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Choose Recipients
                    </h3>
                    <p className="text-sm text-gray-500">
                      Select customers to receive this campaign.
                    </p>
                  </div>
                  <div className="text-sm text-gray-600">
                    Selected:{" "}
                    <span className="font-semibold text-gray-900">
                      {selectedRecipientIds.length}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={recipientQuery}
                    onChange={(event) => setRecipientQuery(event.target.value)}
                    placeholder="Search by name or email"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={toggleVisibleRecipients}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {allVisibleSelected ? "Clear Visible" : "Select Visible"}
                  </button>
                </div>

                <div className="max-h-[460px] overflow-y-auto rounded-xl border border-gray-200">
                  {filteredRecipients.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">
                      No customers found for this domain.
                    </p>
                  ) : (
                    filteredRecipients.map((recipient) => {
                      const selected = selectedRecipientIds.includes(
                        recipient.id,
                      );
                      return (
                        <label
                          key={recipient.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRecipient(recipient.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {recipient.name || "Unnamed Customer"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {recipient.email}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Review & Send
                  </h3>
                  <p className="text-sm text-gray-500">
                    Confirm your recipients and content before sending.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Subject
                      </p>
                      <p className="mt-1 text-sm text-gray-900">{subject}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Template
                      </p>
                      <p className="mt-1 text-sm text-gray-900">
                        {
                          EMAIL_TEMPLATES.find((item) => item.id === templateId)
                            ?.name
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Editor
                      </p>
                      <p className="mt-1 text-sm text-gray-900">
                        {editorMode === "simple"
                          ? "Simple Editor"
                          : "Advanced HTML"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Recipients
                      </p>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedRecipients.length} selected
                      </p>
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                        {selectedRecipients.map((recipient) => (
                          <div
                            key={recipient.id}
                            className="text-xs text-gray-700"
                          >
                            {recipient.name || "Unnamed"} - {recipient.email}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Email Preview
                    </p>
                    <iframe
                      title="Campaign email review preview"
                      sandbox=""
                      srcDoc={effectiveHtmlBody}
                      className="h-[460px] w-full rounded-lg border-0 bg-white"
                    />
                  </div>
                </div>

                {sendResult && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    Campaign sent. Requested: {sendResult.requestedRecipients},
                    Sent: {sendResult.sent}, Failed: {sendResult.failed}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6 sm:py-4"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  onClose();
                  return;
                }
                setStep((prev) => (prev - 1) as WizardStep);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={isSending}
            >
              {step === 1 ? "Cancel" : "Back"}
            </button>

            {step < 3 && (
              <button
                type="button"
                onClick={handleContinue}
                disabled={
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 2 && !canProceedFromStep2)
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Continue
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || selectedRecipientIds.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isSending ? "Sending..." : "Send Campaign"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

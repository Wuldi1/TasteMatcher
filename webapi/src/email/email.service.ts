// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------
import { Injectable, Logger } from "@nestjs/common";
import { EmailClient, EmailMessage } from "@azure/communication-email";
import { Role, Proposal } from "@tastematcher/common";
import {
  shouldSendRealEmail,
  shouldSendVerificationEmail,
} from "../config/runtime-profile";

export interface SendVerificationEmailPayload {
  recipient: string;
  domainName: string;
  code: string;
  expiresAt: number;
}

type ProposalEmailAction = "created" | "updated" | "deleted" | "ping";

type ProposalEmailSummary = {
  title: string;
  introNote: string;
  itemCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  itemCommentCount: number;
  generalCommentCount: number;
  statusLabel: string;
};

type BrandedEmailParams = {
  eyebrow: string;
  heading: string;
  intro: string;
  contentHtml: string;
  cta?: {
    label: string;
    href: string;
  };
  footerNote?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly connectionString?: string;
  private readonly senderAddress?: string;
  private readonly emailClient?: EmailClient;
  private readonly sendsRealEmail: boolean;
  private readonly sendsVerificationEmail: boolean;

  constructor() {
    this.connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    this.senderAddress = process.env.AZURE_EMAIL_SENDER;
    this.sendsRealEmail = shouldSendRealEmail();
    this.sendsVerificationEmail = shouldSendVerificationEmail();

    if (!this.connectionString || !this.senderAddress) {
      this.logger.warn(
        "Azure Communication Services email configuration missing; verification emails will be logged only.",
      );
      return;
    }

    this.emailClient = new EmailClient(this.connectionString);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private formatProposalStatus(status: string | undefined): string {
    if (!status) return "Draft";
    return status
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL ?? "").replace(/\/+$/, "");
  }

  private getEmailIconUrl(): string | undefined {
    const baseUrl = this.getFrontendBaseUrl();
    if (!baseUrl) return undefined;
    return `${baseUrl}/tastematcher_icon_icon_128.png`;
  }

  private buildBrandedEmailHtml(params: BrandedEmailParams): string {
    const iconUrl = this.getEmailIconUrl();
    const escapedIconUrl = iconUrl ? this.escapeHtml(iconUrl) : undefined;
    const ctaHtml = params.cta
      ? `<div style="margin-top:24px;">
          <a href="${this.escapeHtml(params.cta.href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 22px;font-size:15px;font-weight:800;">${this.escapeHtml(params.cta.label)}</a>
        </div>
        <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">If the button does not work, copy this link:<br><span style="word-break:break-all;color:#374151;">${this.escapeHtml(params.cta.href)}</span></p>`
      : "";
    const footerNote =
      params.footerNote ??
      "TasteMatcher helps galleries and advisors curate art around a collector's real preferences.";

    return `
      <div style="margin:0;padding:0;background:#f5f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;margin:0;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
                <tr>
                  <td style="padding:26px 28px 22px;background:#111827;color:#ffffff;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div style="display:inline-block;vertical-align:middle;">
                            ${
                              escapedIconUrl
                                ? `<img src="${escapedIconUrl}" width="38" height="38" alt="TasteMatcher" style="display:inline-block;border:0;border-radius:10px;vertical-align:middle;margin-right:10px;background:#ffffff;" />`
                                : `<span style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;border-radius:10px;background:#2563eb;color:#ffffff;font-weight:800;margin-right:10px;vertical-align:middle;">TM</span>`
                            }
                            <span style="display:inline-block;vertical-align:middle;font-size:18px;font-weight:800;letter-spacing:0.01em;color:#ffffff;">TasteMatcher</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top:24px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#bfdbfe;font-weight:700;">${this.escapeHtml(params.eyebrow)}</div>
                    <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#ffffff;">${this.escapeHtml(params.heading)}</h1>
                    <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#d1d5db;">${this.escapeHtml(params.intro)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    ${params.contentHtml}
                    ${ctaHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                    <div style="font-size:12px;color:#6b7280;line-height:1.5;">${this.escapeHtml(footerNote)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private getViewingRoomMetadata(proposal: Proposal): {
    title?: string;
    introNote?: string;
  } {
    const viewingRoom = proposal.metadata?.viewingRoom;
    if (!viewingRoom || typeof viewingRoom !== "object") {
      return {};
    }

    const metadata = viewingRoom as Record<string, unknown>;
    return {
      title:
        typeof metadata.title === "string" && metadata.title.trim()
          ? metadata.title.trim()
          : undefined,
      introNote:
        typeof metadata.introNote === "string" && metadata.introNote.trim()
          ? metadata.introNote.trim()
          : undefined,
    };
  }

  private summarizeProposal(proposal: Proposal): ProposalEmailSummary {
    const viewingRoom = this.getViewingRoomMetadata(proposal);
    const statusCounts =
      proposal.items?.reduce(
        (acc, item) => {
          acc[item.status] = (acc[item.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ) ?? {};

    return {
      title: viewingRoom.title ?? "Your TasteMatcher proposal",
      introNote:
        viewingRoom.introNote ??
        "A curated selection is ready for review in your private TasteMatcher workspace.",
      itemCount: proposal.items?.length ?? 0,
      pendingCount: statusCounts.pending ?? 0,
      approvedCount: statusCounts.approved ?? 0,
      rejectedCount: statusCounts.rejected ?? 0,
      itemCommentCount:
        proposal.items?.reduce(
          (acc, item) => acc + (item.comments?.length ?? 0),
          0,
        ) ?? 0,
      generalCommentCount: proposal.generalComments?.length ?? 0,
      statusLabel: this.formatProposalStatus(proposal.status),
    };
  }

  private getProposalActionCopy(action: ProposalEmailAction): {
    subject: string;
    eyebrow: string;
    heading: string;
    body: string;
    cta: string;
  } {
    switch (action) {
      case "created":
        return {
          subject: "Your private art proposal is ready",
          eyebrow: "New private selection",
          heading: "Your private viewing room is ready",
          body: "A new curated selection has been prepared for you.",
          cta: "View proposal",
        };
      case "updated":
        return {
          subject: "Your art proposal has been updated",
          eyebrow: "Proposal updated",
          heading: "Your proposal has new updates",
          body: "The latest version includes recent changes, comments, or artwork decisions.",
          cta: "Review updates",
        };
      case "deleted":
        return {
          subject: "A TasteMatcher proposal was removed",
          eyebrow: "Proposal removed",
          heading: "This proposal is no longer active",
          body: "The proposal was removed by the gallery team. Contact them directly if you have questions.",
          cta: "Open TasteMatcher",
        };
      case "ping":
        return {
          subject: "Reminder: review your private art proposal",
          eyebrow: "Review reminder",
          heading: "Your proposal is waiting for review",
          body: "Please review the selection and share your feedback when ready.",
          cta: "Review proposal",
        };
    }
  }

  private buildProposalEmailHtml(params: {
    proposal: Proposal;
    action: ProposalEmailAction;
    portalLink: string;
    recipientContext: "customer" | "team";
    actorLine?: string;
  }): string {
    const copy = this.getProposalActionCopy(params.action);
    const summary = this.summarizeProposal(params.proposal);
    const escapedTitle = this.escapeHtml(summary.title);
    const escapedIntro = this.escapeHtml(summary.introNote);
    const escapedActorLine = params.actorLine
      ? this.escapeHtml(params.actorLine)
      : "";
    const contextLine =
      params.recipientContext === "team"
        ? "Open the customer workspace to adjust the selection, respond to comments, or publish the next version."
        : "Open the proposal to respond to each artwork and leave comments for the gallery team.";

    const contentHtml = `
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:20px;background:#ffffff;">
        <div style="font-size:13px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Private Viewing Room</div>
        <h2 style="margin:8px 0 8px;font-size:22px;line-height:1.3;color:#111827;">${escapedTitle}</h2>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">${escapedIntro}</p>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;">
        <tr>
          <td width="50%" style="padding:0 6px 12px 0;">
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#f9fafb;">
              <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;">Artworks</div>
              <div style="margin-top:4px;font-size:24px;font-weight:800;color:#111827;">${summary.itemCount}</div>
            </div>
          </td>
          <td width="50%" style="padding:0 0 12px 6px;">
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#f9fafb;">
              <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;">Status</div>
              <div style="margin-top:4px;font-size:20px;font-weight:800;color:#111827;">${this.escapeHtml(summary.statusLabel)}</div>
            </div>
          </td>
        </tr>
      </table>

      <div style="border:1px solid #dbeafe;border-radius:14px;background:#eff6ff;padding:16px;margin-top:6px;">
        <div style="font-size:14px;line-height:1.7;color:#1f2937;">
          <strong>Current responses:</strong>
          ${summary.approvedCount} accepted,
          ${summary.pendingCount} pending,
          ${summary.rejectedCount} declined.
        </div>
        <div style="font-size:14px;line-height:1.7;color:#1f2937;">
          <strong>Comments:</strong>
          ${summary.itemCommentCount} artwork comments and
          ${summary.generalCommentCount} general comments.
        </div>
      </div>

      <p style="margin:22px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">${this.escapeHtml(contextLine)}</p>
    `;

    return this.buildBrandedEmailHtml({
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      intro: `${copy.body}${escapedActorLine ? ` ${params.actorLine}` : ""}`,
      contentHtml,
      cta: {
        label: copy.cta,
        href: params.portalLink,
      },
    });
  }

  /**
   * Sends a verification code email via Azure Communication Services.
   * Falls back to structured logging when configuration is incomplete.
   */
  async sendVerificationEmail(
    payload: SendVerificationEmailPayload,
  ): Promise<void> {
    const start = Date.now();
    this.logger.debug({
      action: "sendVerificationEmail",
      recipient: payload.recipient,
      domainName: payload.domainName,
    });

    if (!payload.recipient.includes("@")) {
      throw new Error("Invalid recipient email address");
    }

    const subject = "Your TasteMatcher verification code";
    const textBody = [
      "Hi,",
      "",
      `Your verification code for ${payload.domainName} is ${payload.code}.`,
      `It will expire at ${new Date(payload.expiresAt).toLocaleString()}.`,
      "",
      "If you did not request this code, please ignore this email.",
    ].join("\n");

    const htmlBody = this.buildBrandedEmailHtml({
      eyebrow: "Secure sign in",
      heading: "Your verification code",
      intro: `Use this code to continue signing in to ${payload.domainName}.`,
      contentHtml: `
        <div style="border:1px solid #dbeafe;border-radius:16px;background:#eff6ff;padding:22px;text-align:center;">
          <div style="font-size:12px;color:#1d4ed8;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;">Verification Code</div>
          <div style="margin-top:12px;font-size:34px;line-height:1.1;font-weight:900;letter-spacing:0.22em;color:#111827;">${this.escapeHtml(payload.code)}</div>
          <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">This code expires at ${this.escapeHtml(new Date(payload.expiresAt).toLocaleString())}.</p>
        </div>
        <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">If you did not request this code, you can safely ignore this email.</p>
      `,
      footerNote:
        "TasteMatcher sends verification codes to protect gallery and collector accounts.",
    });

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: "sendVerificationEmail",
        mode: "log-only",
        recipient: payload.recipient,
        durationMs: Date.now() - start,
      });
      return;
    }

    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject,
        plainText: textBody,
        html: htmlBody,
      },
      recipients: {
        to: [{ address: payload.recipient }],
      },
    };

    try {
      await this.sendEmail(message, "verification");

      this.logger.log({
        action: "sendVerificationEmail",
        recipient: payload.recipient,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: "sendVerificationEmail",
        recipient: payload.recipient,
        errMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Send invitation email to a new user
   * Sends email via Azure Communication Services
   */
  async sendUserInvitation(
    email: string,
    name: string,
    domainId: string,
    role: Role,
  ): Promise<void> {
    const start = Date.now();
    this.logger.debug({
      action: "sendUserInvitation",
      recipient: email,
      role,
      domainId,
    });

    if (!email.includes("@")) {
      throw new Error("Invalid recipient email address");
    }

    const baseUrl = this.getFrontendBaseUrl();
    const inviteLink = `${baseUrl}/login?email=${encodeURIComponent(email)}`;

    const subject = "You've been invited to TasteMatcher";
    const textBody = [
      `Hello ${name},`,
      "",
      `You've been invited to join TasteMatcher as a ${role}.`,
      "",
      "Click the link below to log in and get started:",
      inviteLink,
      "",
      "Welcome to TasteMatcher!",
    ].join("\n");

    const htmlBody = this.buildBrandedEmailHtml({
      eyebrow: "Gallery invitation",
      heading: "You have been invited to TasteMatcher",
      intro: `${name}, your gallery team invited you to join their TasteMatcher workspace.`,
      contentHtml: `
        <div style="border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;padding:20px;">
          <div style="font-size:13px;color:#6b7280;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">Your role</div>
          <div style="margin-top:8px;font-size:22px;font-weight:900;color:#111827;text-transform:capitalize;">${this.escapeHtml(role.replace(/_/g, " "))}</div>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">Use TasteMatcher to review art, share preferences, and collaborate on curated proposals.</p>
        </div>
      `,
      cta: {
        label: "Join TasteMatcher",
        href: inviteLink,
      },
    });

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: "sendUserInvitation",
        mode: "log-only",
        recipient: email,
        role,
        inviteLink,
        durationMs: Date.now() - start,
      });
      return;
    }

    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject,
        plainText: textBody,
        html: htmlBody,
      },
      recipients: {
        to: [{ address: email }],
      },
    };

    try {
      await this.sendEmail(message);

      this.logger.log({
        action: "sendUserInvitation",
        recipient: email,
        role,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: "sendUserInvitation",
        recipient: email,
        role,
        errMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Send proposal notification email to customer.
   * action: 'created' | 'updated' | 'deleted' | 'ping'
   */
  async sendProposalNotification(
    recipient: string,
    proposal: Proposal,
    action: "created" | "updated" | "deleted" | "ping",
  ): Promise<void> {
    const start = Date.now();
    this.logger.debug({
      action: "sendProposalNotification",
      recipient,
      proposalId: proposal.id,
      domainId: proposal.domainId,
      notificationType: action,
    });

    if (!recipient || !recipient.includes("@")) {
      throw new Error(
        "Invalid recipient email address for proposal notification",
      );
    }

    const baseUrl = process.env.FRONTEND_URL ?? "";
    const proposalLink = `${baseUrl}/buying-proposal`;
    const copy = this.getProposalActionCopy(action);
    const summary = this.summarizeProposal(proposal);
    const subject = copy.subject;
    const textBody = [
      "Hello,",
      "",
      copy.body,
      "",
      summary.title,
      summary.introNote,
      "",
      `Artworks: ${summary.itemCount}`,
      `Status: ${summary.statusLabel}`,
      `Responses: ${summary.approvedCount} accepted, ${summary.pendingCount} pending, ${summary.rejectedCount} declined`,
      `Comments: ${summary.itemCommentCount} artwork comments, ${summary.generalCommentCount} general comments`,
      "",
      action === "deleted" ? "Open TasteMatcher:" : "View proposal:",
      proposalLink,
      "",
      "Thank you,",
      "TasteMatcher",
    ].join("\n");
    const htmlBody = this.buildProposalEmailHtml({
      proposal,
      action,
      portalLink: proposalLink,
      recipientContext: "customer",
    });

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: "sendProposalNotification",
        mode: "log-only",
        recipient,
        subject,
        proposalId: proposal.id,
        durationMs: Date.now() - start,
      });
      return;
    }

    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject,
        plainText: textBody,
        html: htmlBody,
      },
      recipients: {
        to: [{ address: recipient }],
      },
    };

    try {
      await this.sendEmail(message);

      this.logger.log({
        action: "sendProposalNotification",
        recipient,
        proposalId: proposal.id,
        notificationType: action,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: "sendProposalNotification",
        recipient,
        proposalId: proposal.id,
        errMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Send a detailed proposal digest to multiple recipients.
   * Includes proposal items, comments, status, and a direct portal link.
   */
  async sendProposalDigest(params: {
    recipients: string[];
    proposal: Proposal;
    action: "created" | "updated";
    actorEmail?: string;
    actorRole?: string;
    portalLink?: string;
  }): Promise<void> {
    const start = Date.now();
    const safeRecipients = Array.from(
      new Set(
        (params.recipients || []).filter(
          (email) => typeof email === "string" && email.includes("@"),
        ),
      ),
    );

    this.logger.debug({
      action: "sendProposalDigest",
      recipients: safeRecipients,
      proposalId: params.proposal.id,
      domainId: params.proposal.domainId,
      notificationType: params.action,
    });

    if (safeRecipients.length === 0) {
      this.logger.warn("sendProposalDigest called without valid recipients");
      return;
    }

    const baseUrl = process.env.FRONTEND_URL ?? "";
    const proposalLink =
      params.portalLink ?? `${baseUrl}/sales/proposals/${params.proposal.id}`;

    const subject =
      params.action === "created"
        ? "New TasteMatcher proposal activity"
        : "TasteMatcher proposal updated";

    const actorLine =
      params.actorEmail || params.actorRole
        ? ` by ${params.actorEmail ?? params.actorRole}`
        : "";
    const summary = this.summarizeProposal(params.proposal);

    const textBody = [
      `Hello,`,
      ``,
      `Proposal ${params.proposal.id} was ${params.action}${actorLine}.`,
      ``,
      summary.title,
      summary.introNote,
      ``,
      `View in portal: ${proposalLink}`,
      ``,
      `Artworks: ${summary.itemCount}`,
      `Status: ${summary.statusLabel}`,
      `Responses: ${summary.approvedCount} accepted, ${summary.pendingCount} pending, ${summary.rejectedCount} declined`,
      `Comments: ${summary.itemCommentCount} artwork comments, ${summary.generalCommentCount} general comments`,
      ``,
      `Thank you,`,
      `TasteMatcher`,
    ].join("\n");

    const htmlBody = this.buildProposalEmailHtml({
      proposal: params.proposal,
      action: params.action,
      portalLink: proposalLink,
      recipientContext: "team",
      actorLine,
    });

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: "sendProposalDigest",
        mode: "log-only",
        recipients: safeRecipients,
        subject,
        proposalId: params.proposal.id,
        durationMs: Date.now() - start,
      });
      return;
    }

    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject,
        plainText: textBody,
        html: htmlBody,
      },
      recipients: {
        to: safeRecipients.map((address) => ({ address })),
      },
    };

    try {
      await this.sendEmail(message);

      this.logger.log({
        action: "sendProposalDigest",
        recipients: safeRecipients,
        proposalId: params.proposal.id,
        notificationType: params.action,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: "sendProposalDigest",
        recipients: safeRecipients,
        proposalId: params.proposal.id,
        errMessage: (error as Error).message,
      });
      throw error;
    }
  }

  async sendBulkCustomEmail(params: {
    recipients: string[];
    subject: string;
    htmlBody: string;
    textBody?: string;
    category?: string;
  }): Promise<{
    requested: number;
    sent: number;
    failed: number;
    failedRecipients: string[];
  }> {
    const start = Date.now();
    const safeRecipients = Array.from(
      new Set(
        (params.recipients || []).filter(
          (email) => typeof email === "string" && email.includes("@"),
        ),
      ),
    );

    const subject = (params.subject || "").trim();
    const htmlBody = params.htmlBody || "";
    const textBody = (params.textBody || "").trim();

    if (!subject || !htmlBody || safeRecipients.length === 0) {
      this.logger.warn({
        action: "sendBulkCustomEmail",
        reason: "invalid_input",
        recipientCount: safeRecipients.length,
      });
      return {
        requested: safeRecipients.length,
        sent: 0,
        failed: safeRecipients.length,
        failedRecipients: safeRecipients,
      };
    }

    this.logger.debug({
      action: "sendBulkCustomEmail",
      recipientCount: safeRecipients.length,
      category: params.category ?? "custom",
    });

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: "sendBulkCustomEmail",
        mode: "log-only",
        recipients: safeRecipients,
        subject,
        category: params.category ?? "custom",
        durationMs: Date.now() - start,
      });
      return {
        requested: safeRecipients.length,
        sent: safeRecipients.length,
        failed: 0,
        failedRecipients: [],
      };
    }

    let sent = 0;
    const failedRecipients: string[] = [];

    for (const recipient of safeRecipients) {
      const message: EmailMessage = {
        senderAddress: this.senderAddress,
        content: {
          subject,
          plainText: textBody || undefined,
          html: htmlBody,
        },
        recipients: {
          to: [{ address: recipient }],
        },
      };

      try {
        await this.sendEmail(message);
        sent += 1;
      } catch (error) {
        failedRecipients.push(recipient);
        this.logger.error({
          action: "sendBulkCustomEmail",
          recipient,
          errMessage: (error as Error).message,
        });
      }
    }

    this.logger.log({
      action: "sendBulkCustomEmail",
      requested: safeRecipients.length,
      sent,
      failed: failedRecipients.length,
      category: params.category ?? "custom",
      durationMs: Date.now() - start,
    });

    return {
      requested: safeRecipients.length,
      sent,
      failed: failedRecipients.length,
      failedRecipients,
    };
  }

  async sendEmail(
    message: EmailMessage,
    deliveryType: "verification" | "side-effect" = "side-effect",
  ): Promise<void> {
    const isDeliveryAllowed =
      deliveryType === "verification"
        ? this.sendsVerificationEmail
        : this.sendsRealEmail;

    if (isDeliveryAllowed && this.emailClient) {
      try {
        this.logger.log({
          action: "sendEmail",
          deliveryType,
          mode: "delivery",
        });
        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
      } catch (error) {
        this.logger.error({
          action: "sendEmail",
          errMessage: (error as Error).message,
        });
        throw error;
      }
    }
    return new Promise((resolve) => resolve());
  }
}

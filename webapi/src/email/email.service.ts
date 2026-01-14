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

export interface SendVerificationEmailPayload {
  recipient: string;
  domainName: string;
  code: string;
  expiresAt: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly connectionString?: string;
  private readonly senderAddress?: string;
  private readonly emailClient?: EmailClient;
  private readonly isPrd?: boolean;

  constructor() {
    this.connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    this.senderAddress = process.env.AZURE_EMAIL_SENDER;
    this.isPrd = process.env.NODE_ENV === "prd";

    if (!this.connectionString || !this.senderAddress) {
      this.logger.warn(
        "Azure Communication Services email configuration missing; verification emails will be logged only.",
      );
      return;
    }

    this.emailClient = new EmailClient(this.connectionString);
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

    const htmlBody = [
      "<p>Hi,</p>",
      `<p>Your verification code for <strong>${payload.domainName}</strong> is <strong>${payload.code}</strong>.</p>`,
      `<p>This code expires at ${new Date(payload.expiresAt).toLocaleString()}.</p>`,
      "<p>If you did not request this code, please ignore this email.</p>",
    ].join("");

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
      await this.sendEmail(message);

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

    const inviteLink = `${process.env.FRONTEND_URL}/login?email=${encodeURIComponent(email)}`;

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

    const htmlBody = [
      `<h2>Hello ${name},</h2>`,
      `<p>You've been invited to join TasteMatcher as a <strong>${role}</strong>.</p>`,
      "<p>Click the link below to log in and get started:</p>",
      `<p><a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Join TasteMatcher</a></p>`,
      `<p style="color: #666; font-size: 14px;">Or copy this link: ${inviteLink}</p>`,
      "<br>",
      "<p>Welcome to TasteMatcher!</p>",
    ].join("");

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
    const proposalLink = `${baseUrl}/sales/proposals/${proposal.id}`;

    let subject = "Proposal update from TasteMatcher";
    let textBody = "";
    let htmlBody = "";

    switch (action) {
      case "created":
        subject = "A new proposal has been created for you";
        textBody = `Hello,\n\nA new proposal has been created for you. View it here: ${proposalLink}\n\nThank you,\nTasteMatcher`;
        htmlBody = `<p>Hello,</p><p>A new proposal has been created for you. <a href="${proposalLink}">View proposal</a></p><p>Thank you,<br/>TasteMatcher</p>`;
        break;
      case "updated":
        subject = "Your proposal has been updated";
        textBody = `Hello,\n\nYour proposal has been updated. View the latest version here: ${proposalLink}\n\nThank you,\nTasteMatcher`;
        htmlBody = `<p>Hello,</p><p>Your proposal has been updated. <a href="${proposalLink}">View proposal</a></p><p>Thank you,<br/>TasteMatcher</p>`;
        break;
      case "deleted":
        subject = "A proposal has been removed";
        textBody = `Hello,\n\nA proposal for you was deleted by the dealer. If you have questions, contact support.\n\nThank you,\nTasteMatcher`;
        htmlBody = `<p>Hello,</p><p>A proposal for you was deleted by the dealer. If you have questions, contact support.</p><p>Thank you,<br/>TasteMatcher</p>`;
        break;
      case "ping":
        subject = "Reminder: please review your proposal";
        textBody = `Hello,\n\nThis is a reminder to review your proposal: ${proposalLink}\n\nThank you,\nTasteMatcher`;
        htmlBody = `<p>Hello,</p><p>This is a reminder to review your proposal: <a href="${proposalLink}">View proposal</a></p><p>Thank you,<br/>TasteMatcher</p>`;
        break;
      default:
        subject = "Proposal notification";
        textBody = `Hello,\n\nThere is an update regarding your proposal. View it here: ${proposalLink}\n\nThank you,\nTasteMatcher`;
        htmlBody = `<p>Hello,</p><p>There is an update regarding your proposal. <a href="${proposalLink}">View proposal</a></p><p>Thank you,<br/>TasteMatcher</p>`;
    }

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
        ? "New proposal shared with you"
        : "Proposal updated";

    const actorLine =
      params.actorEmail || params.actorRole
        ? ` by ${params.actorEmail ?? params.actorRole}`
        : "";

    const totalArtworks = params.proposal.items?.length ?? 0;
    const statusCounts =
      params.proposal.items?.reduce(
        (acc, item) => {
          acc[item.status] = (acc[item.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ) ?? {};

    const totalItemComments =
      params.proposal.items?.reduce(
        (acc, item) => acc + (item.comments?.length ?? 0),
        0,
      ) ?? 0;
    const totalGeneralComments = params.proposal.generalComments?.length ?? 0;

    const statusSummary = ["approved", "pending", "rejected"]
      .map((key) => `${key}: ${statusCounts[key] ?? 0}`)
      .join(", ");

    const textBody = [
      `Hello,`,
      ``,
      `Proposal ${params.proposal.id} was ${params.action}${actorLine}.`,
      `Status: ${params.proposal.status}`,
      ``,
      `View in portal: ${proposalLink}`,
      ``,
      `Artworks: ${totalArtworks}`,
      `Statuses -> ${statusSummary}`,
      `Artwork comments: ${totalItemComments}`,
      `General comments: ${totalGeneralComments}`,
      ``,
      `Thank you,`,
      `TasteMatcher`,
    ].join("\n");

    const htmlBody = [
      `<p>Hello,</p>`,
      `<p>Proposal <strong>${params.proposal.id}</strong> was <strong>${params.action}</strong>${actorLine ? `<span>${actorLine}</span>` : ""}.</p>`,
      `<p>Status: <strong>${params.proposal.status}</strong></p>`,
      `<p><a href="${proposalLink}">View in portal</a></p>`,
      `<p><strong>Artworks:</strong> ${totalArtworks}</p>`,
      `<p><strong>Statuses:</strong> ${statusSummary}</p>`,
      `<p><strong>Artwork comments:</strong> ${totalItemComments}</p>`,
      `<p><strong>General comments:</strong> ${totalGeneralComments}</p>`,
      `<p>Thank you,<br/>TasteMatcher</p>`,
    ].join("");

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

  async sendEmail(message: EmailMessage): Promise<void> {
    // Placeholder for future email sending functionality
    if (this.isPrd && this.emailClient) {
      try {
        this.logger.log("Production environment detected; sending email", {
          message,
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

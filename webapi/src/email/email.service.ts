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
import { Injectable, Logger } from '@nestjs/common';
import { EmailClient, EmailMessage } from '@azure/communication-email';
import { Role } from '@tastematcher/common';

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

  constructor() {
    this.connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    this.senderAddress = process.env.AZURE_EMAIL_SENDER;

    if (!this.connectionString || !this.senderAddress) {
      this.logger.warn(
        'Azure Communication Services email configuration missing; verification emails will be logged only.',
      );
      return;
    }

    this.emailClient = new EmailClient(this.connectionString);
  }

  /**
   * Sends a verification code email via Azure Communication Services.
   * Falls back to structured logging when configuration is incomplete.
   */
  async sendVerificationEmail(payload: SendVerificationEmailPayload): Promise<void> {
    const start = Date.now();
    this.logger.debug({
      action: 'sendVerificationEmail',
      recipient: payload.recipient,
      domainName: payload.domainName,
    });

    if (!payload.recipient.includes('@')) {
      throw new Error('Invalid recipient email address');
    }

    const subject = 'Your TasteMatcher verification code';
    const textBody = [
      'Hi,',
      '',
      `Your verification code for ${payload.domainName} is ${payload.code}.`,
      `It will expire at ${new Date(payload.expiresAt).toLocaleString()}.`,
      '',
      'If you did not request this code, please ignore this email.',
    ].join('\n');

    const htmlBody = [
      '<p>Hi,</p>',
      `<p>Your verification code for <strong>${payload.domainName}</strong> is <strong>${payload.code}</strong>.</p>`,
      `<p>This code expires at ${new Date(payload.expiresAt).toLocaleString()}.</p>`,
      '<p>If you did not request this code, please ignore this email.</p>',
    ].join('');

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: 'sendVerificationEmail',
        mode: 'log-only',
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
      const poller = await this.emailClient.beginSend(message);
      // await poller.pollUntilDone(); // TODO : maybe remove for faster UI response

      this.logger.log({
        action: 'sendVerificationEmail',
        recipient: payload.recipient,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: 'sendVerificationEmail',
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
      action: 'sendUserInvitation',
      recipient: email,
      role,
      domainId,
    });

    if (!email.includes('@')) {
      throw new Error('Invalid recipient email address');
    }

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/login?email=${encodeURIComponent(email)}`;

    const subject = 'You\'ve been invited to TasteMatcher';
    const textBody = [
      `Hello ${name},`,
      '',
      `You've been invited to join TasteMatcher as a ${role}.`,
      '',
      'Click the link below to log in and get started:',
      inviteLink,
      '',
      'Welcome to TasteMatcher!',
    ].join('\n');

    const htmlBody = [
      `<h2>Hello ${name},</h2>`,
      `<p>You've been invited to join TasteMatcher as a <strong>${role}</strong>.</p>`,
      '<p>Click the link below to log in and get started:</p>',
      `<p><a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Join TasteMatcher</a></p>`,
      `<p style="color: #666; font-size: 14px;">Or copy this link: ${inviteLink}</p>`,
      '<br>',
      '<p>Welcome to TasteMatcher!</p>',
    ].join('');

    if (!this.emailClient || !this.senderAddress) {
      this.logger.log({
        action: 'sendUserInvitation',
        mode: 'log-only',
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
      const poller = await this.emailClient.beginSend(message);
      // await poller.pollUntilDone(); // Optional: wait for email to be sent

      this.logger.log({
        action: 'sendUserInvitation',
        recipient: email,
        role,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error({
        action: 'sendUserInvitation',
        recipient: email,
        role,
        errMessage: (error as Error).message,
      });
      throw error;
    }
  }
}

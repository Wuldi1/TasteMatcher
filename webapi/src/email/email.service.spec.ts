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
import { Logger } from "@nestjs/common";
import { EmailClient } from "@azure/communication-email";
import type { Proposal } from "@tastematcher/common";
import { EmailService, SendVerificationEmailPayload } from "./email.service";

jest.mock("@azure/communication-email", () => {
  class EmailPoller {
    async pollUntilDone(): Promise<void> {
      return Promise.resolve();
    }
  }

  return {
    EmailClient: jest.fn().mockImplementation(() => ({
      beginSend: jest.fn().mockResolvedValue(new EmailPoller()),
    })),
  };
});

const MockedEmailClient = EmailClient as unknown as jest.Mock;
const getMockedBeginSend = () =>
  MockedEmailClient.mock.results[0].value.beginSend as jest.Mock;

const buildProposal = (): Proposal => ({
  id: "proposal-1",
  type: "proposal",
  domainId: "domain-1",
  userId: "customer-1",
  dealerId: "dealer-1",
  items: [
    {
      artworkId: "artwork-1",
      comments: [{ author: "Customer", text: "Can I see more?", createdAt: 1 }],
      status: "pending",
      askedPrice: 12000,
    },
    {
      artworkId: "artwork-2",
      comments: [],
      status: "approved",
      askedPrice: 18000,
    },
  ],
  status: "submitted",
  generalComments: [
    { author: "Specialist", text: "Curated for the living room.", createdAt: 1 },
  ],
  createdAt: 1,
  metadata: {
    viewingRoom: {
      title: "Works selected for Avery",
      introNote: "A focused group based on recent likes.",
    },
  },
});

describe("EmailService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("sends verification email when configuration is provided", async () => {
    process.env.NODE_ENV = "prd";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING =
      "endpoint=https://unit-test/;accessKey=abc";
    process.env.AZURE_EMAIL_SENDER = "no-reply@example.com";

    const service = new EmailService();
    const payload: SendVerificationEmailPayload = {
      recipient: "user@example.com",
      domainName: "Test Gallery",
      code: "123456",
      expiresAt: new Date("2025-01-01T00:00:00.000Z").getTime(),
    };

    await service.sendVerificationEmail(payload);

    expect(MockedEmailClient).toHaveBeenCalledWith(
      "endpoint=https://unit-test/;accessKey=abc",
    );
    expect(getMockedBeginSend()).toHaveBeenCalledWith({
      senderAddress: "no-reply@example.com",
      content: expect.objectContaining({
        subject: "Your TasteMatcher verification code",
        html: expect.stringContaining("TasteMatcher"),
      }),
      recipients: { to: [{ address: payload.recipient }] },
    });
    const sentMessage = getMockedBeginSend().mock.calls[0][0];
    expect(sentMessage.content.html).toContain("Verification Code");
  });

  it("logs a warning and skips sending when configuration is missing", async () => {
    delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    delete process.env.AZURE_EMAIL_SENDER;

    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const service = new EmailService();

    await service.sendVerificationEmail({
      recipient: "user@example.com",
      domainName: "Test Gallery",
      code: "654321",
      expiresAt: new Date("2025-01-01T00:00:00.000Z").getTime(),
    });

    expect(MockedEmailClient).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Azure Communication Services email configuration missing; verification emails will be logged only.",
    );
  });

  it("sends only verification email in local-production mode", async () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_RUNTIME_MODE = "local-production";
    process.env.TASTEMATCHER_DATA_ENV = "prd";
    process.env.TASTEMATCHER_EMAIL_MODE = "verification-only";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING =
      "endpoint=https://unit-test/;accessKey=abc";
    process.env.AZURE_EMAIL_SENDER = "no-reply@example.com";

    const service = new EmailService();
    await service.sendVerificationEmail({
      recipient: "user@example.com",
      domainName: "Production-backed test",
      code: "123456",
      expiresAt: new Date("2025-01-01T00:00:00.000Z").getTime(),
    });

    expect(MockedEmailClient).toHaveBeenCalled();
    expect(getMockedBeginSend()).toHaveBeenCalledTimes(1);

    process.env.FRONTEND_URL = "http://localhost:3000";
    await service.sendUserInvitation(
      "invitee@example.com",
      "Invitee",
      "domain-1",
      "customer" as never,
    );

    expect(getMockedBeginSend()).toHaveBeenCalledTimes(1);
  });

  it("sends a branded invitation email with the TasteMatcher icon", async () => {
    process.env.NODE_ENV = "prd";
    process.env.FRONTEND_URL = "https://app.tastematcher.art";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING =
      "endpoint=https://unit-test/;accessKey=abc";
    process.env.AZURE_EMAIL_SENDER = "no-reply@example.com";

    const service = new EmailService();

    await service.sendUserInvitation(
      "invitee@example.com",
      "Invitee",
      "domain-1",
      "customer",
    );

    expect(getMockedBeginSend()).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject: "You've been invited to TasteMatcher",
          html: expect.stringContaining(
            "https://app.tastematcher.art/tastematcher_icon_icon_128.png",
          ),
          plainText: expect.stringContaining("Welcome to TasteMatcher"),
        }),
        recipients: { to: [{ address: "invitee@example.com" }] },
      }),
    );
    const sentMessage = getMockedBeginSend().mock.calls[0][0];
    expect(sentMessage.content.html).toContain("Join TasteMatcher");
    expect(sentMessage.content.html).toContain("Your role");
  });

  it("sends a styled proposal notification with viewing-room details", async () => {
    process.env.NODE_ENV = "prd";
    process.env.FRONTEND_URL = "https://app.tastematcher.art";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING =
      "endpoint=https://unit-test/;accessKey=abc";
    process.env.AZURE_EMAIL_SENDER = "no-reply@example.com";

    const service = new EmailService();

    await service.sendProposalNotification(
      "collector@example.com",
      buildProposal(),
      "updated",
    );

    expect(getMockedBeginSend()).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject: "Your art proposal has been updated",
          html: expect.stringContaining("Works selected for Avery"),
          plainText: expect.stringContaining("A focused group based on recent likes."),
        }),
        recipients: { to: [{ address: "collector@example.com" }] },
      }),
    );
    const sentMessage = getMockedBeginSend().mock.calls[0][0];
    expect(sentMessage.content.html).toContain(
      "https://app.tastematcher.art/tastematcher_icon_icon_128.png",
    );
    expect(sentMessage.content.html).toContain("Review updates");
    expect(sentMessage.content.html).toContain(
      "https://app.tastematcher.art/buying-proposal",
    );
    expect(sentMessage.content.html).toContain("1 accepted");
  });

  it("sends a styled proposal digest back to the sales workspace", async () => {
    process.env.NODE_ENV = "prd";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING =
      "endpoint=https://unit-test/;accessKey=abc";
    process.env.AZURE_EMAIL_SENDER = "no-reply@example.com";

    const service = new EmailService();

    await service.sendProposalDigest({
      recipients: ["dealer@example.com"],
      proposal: buildProposal(),
      action: "updated",
      actorEmail: "collector@example.com",
      actorRole: "customer",
      portalLink:
        "https://app.tastematcher.art/sales?domainId=domain-1&userId=customer-1",
    });

    expect(getMockedBeginSend()).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject: "TasteMatcher proposal updated",
          html: expect.stringContaining("Open the customer workspace"),
          plainText: expect.stringContaining("collector@example.com"),
        }),
        recipients: { to: [{ address: "dealer@example.com" }] },
      }),
    );
    const sentMessage = getMockedBeginSend().mock.calls[0][0];
    expect(sentMessage.content.html).toContain(
      "https://app.tastematcher.art/sales?domainId=domain-1&amp;userId=customer-1",
    );
    expect(sentMessage.content.html).toContain("1 artwork comments");
  });
});

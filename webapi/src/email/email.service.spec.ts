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
      }),
      recipients: { to: [{ address: payload.recipient }] },
    });
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
});

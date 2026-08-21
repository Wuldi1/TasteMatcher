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
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { EmailService } from "../email/email.service";
import { sign } from "jsonwebtoken";
import { CreateDomainRequestDto } from "./dto/create-domain-request.dto";

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "jwt-token"),
}));

type DomainStore = Record<string, any>; // simple in-memory mock store

const createMockContainer = () => {
  const store: DomainStore = {};
  const container = {
    items: {
      query: jest.fn().mockImplementation(({ parameters }) => {
        const emailParam = parameters?.find(
          (p: { name: string }) => p.name === "@adminEmail",
        )?.value;
        const idParam = parameters?.find(
          (p: { name: string }) => p.name === "@id",
        )?.value;
        const ownerEmailParam = parameters?.find(
          (p: { name: string }) => p.name === "@email",
        )?.value;
        const domainIdParam = parameters?.find(
          (p: { name: string }) => p.name === "@domainId",
        )?.value;
        const resources = Object.values(store).filter((doc) => {
          if (emailParam) {
            return doc.adminEmail === emailParam;
          }
          if (idParam) {
            return doc.id === idParam;
          }
          if (ownerEmailParam) {
            return (
              doc.type === "user" &&
              doc.email === ownerEmailParam &&
              doc.domainId === domainIdParam
            );
          }
          return true;
        });
        return { fetchAll: async () => ({ resources }) };
      }),
      create: jest.fn().mockImplementation(async (doc) => {
        store[doc.id] = doc;
        return { resource: { ...doc } };
      }),
    },
    item: jest.fn().mockImplementation((id: string, _: string) => ({
      replace: jest.fn().mockImplementation(async (doc) => {
        store[id] = doc;
        return { resource: { ...doc } };
      }),
    })),
    __store: store,
  };
  return container;
};

describe("DomainsService", () => {
  let service: DomainsService;
  let emailService: EmailService;
  let mockContainer: ReturnType<typeof createMockContainer>;

  beforeAll(() => {
    process.env.AzureWebJobsStorage = "UseDevelopmentStorage=true";
    process.env.AZURE_AI_VISION_ENDPOINT = "https://example.com";
    process.env.AZURE_AI_VISION_KEY = "test-key";
    process.env.COSMOS_DB_ENDPOINT = "https://example.com";
    process.env.COSMOS_DB_KEY = "test-key";
    process.env.COSMOS_DB_DATABASE = "test-db";
    process.env.AZURE_STORAGE_ACCOUNT = "test-account";
    process.env.AZURE_STORAGE_ACCOUNT_KEY = "test-key";
    process.env.IMAGE_PROCESSING_QUEUE_NAME = "test-queue";
  });

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";

    mockContainer = createMockContainer();

    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

    service = new DomainsService(emailService);
    (
      service as unknown as {
        cosmosService: { getContainer: jest.Mock };
      }
    ).cosmosService = {
      getContainer: jest.fn().mockResolvedValue(mockContainer),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
  });

  it("creates a new domain without issuing a verification code", async () => {
    const dto: CreateDomainRequestDto = {
      name: "Gallery",
      email: "new@tld.com",
      proposedDomainName: "gallery.com",
    };

    const result = await service.createDomain(dto);

    expect(result.adminEmail).toBe("new@tld.com");
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rejects creation if domain already exists", async () => {
    const dto: CreateDomainRequestDto = {
      name: "Gallery",
      email: "dup@tld.com",
      proposedDomainName: "gallery.com",
    };
    await service.createDomain(dto);

    await expect(service.createDomain(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("sends verification for existing domain via GET endpoint", async () => {
    const email = "existing@tld.com";
    await service.createDomain({
      name: "Existing",
      email,
      proposedDomainName: "existing.com",
    });

    const result = await service.sendVerificationCode(email);

    expect(result.adminEmail).toBe(email);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("throws NotFound when requesting verification for missing domain", async () => {
    await expect(
      service.sendVerificationCode("missing@tld.com"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("verifies code successfully and returns token", async () => {
    const email = "verify@tld.com";
    await service.createDomain({
      name: "Verify",
      email,
      proposedDomainName: "verify.com",
    });
    await service.sendVerificationCode(email);

    const sentCode = (emailService.sendVerificationEmail as jest.Mock).mock
      .calls[0][0].code as string;

    const result = await service.verifyDomainCode(email, sentCode);

    expect(result.token).toBe("jwt-token");
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String), email }),
      "test-secret",
      expect.objectContaining({ expiresIn: "4h" }),
    );
  });

  it("rejects invalid verification code", async () => {
    const email = "invalid@tld.com";
    await service.createDomain({
      name: "Invalid",
      email,
      proposedDomainName: "invaliddomain.com",
    });
    await service.sendVerificationCode(email);

    await expect(
      service.verifyDomainCode(email, "123456"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects expired verification code", async () => {
    const email = "expired@tld.com";
    await service.createDomain({
      name: "Expired",
      email,
      proposedDomainName: "expireddomain.com",
    });
    await service.sendVerificationCode(email);
    const storeEntry = Object.values((mockContainer as any).__store)[0] as any;
    storeEntry.verificationCodeExpiresAt = Date.now() - 1000;

    await expect(
      service.verifyDomainCode(
        email,
        (emailService.sendVerificationEmail as jest.Mock).mock.calls[0][0].code,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

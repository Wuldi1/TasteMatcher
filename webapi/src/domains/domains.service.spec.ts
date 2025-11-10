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
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { EmailService } from '../email/email.service';
import { DomainDto } from './dto/domain.dto';
import { sign } from 'jsonwebtoken';
import { CosmosService } from '@tastematcher/common';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'jwt-token'),
}));

type DomainStore = Record<string, any>; // simple in-memory mock store

const createMockContainer = () => {
  const store: DomainStore = {};
  const container = {
    items: {
      query: jest.fn().mockImplementation(({ parameters }) => {
        const emailParam = parameters?.find((p: { name: string }) => p.name === '@adminEmail')?.value;
        const idParam = parameters?.find((p: { name: string }) => p.name === '@id')?.value;
        const resources = Object.values(store).filter((doc) => {
          if (emailParam) {
            return doc.adminEmail === emailParam;
          }
          if (idParam) {
            return doc.id === idParam;
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

describe('DomainsService', () => {
  let service: DomainsService;
  let cosmos: CosmosService;
  let email: EmailService;
  let mockContainer: ReturnType<typeof createMockContainer>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';

    mockContainer = createMockContainer();

    email = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

    service = new DomainsService(email);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
  });

  it('creates a new domain and issues verification code', async () => {
    const dto: DomainDto = { name: 'Gallery', adminEmail: 'new@tld.com' };

    const result = await service.createDomain(dto);

    expect(result.adminEmail).toBe('new@tld.com');
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(
      'new@tld.com',
      'Gallery',
      expect.any(String),
      expect.any(String),
    );
  });

  it('rejects creation if domain already exists', async () => {
    const dto: DomainDto = { name: 'Gallery', adminEmail: 'dup@tld.com' };
    await service.createDomain(dto);

    await expect(service.createDomain(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sends verification for existing domain via GET endpoint', async () => {
    const adminEmail = 'existing@tld.com';
    await service.createDomain({ name: 'Existing', adminEmail });

    const result = await service.sendVerificationCode(adminEmail);

    expect(result.adminEmail).toBe(adminEmail);
    expect(email.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });

  it('throws NotFound when requesting verification for missing domain', async () => {
    await expect(service.sendVerificationCode('missing@tld.com')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('verifies code successfully and returns token', async () => {
    const adminEmail = 'verify@tld.com';
    await service.createDomain({ name: 'Verify', adminEmail });

    const sentCode = (email.sendVerificationEmail as jest.Mock).mock.calls[0][2] as string;

    const result = await service.verifyDomainCode(adminEmail, sentCode);

    expect(result.token).toBe('jwt-token');
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: expect.any(String), email: adminEmail }),
      'test-secret',
      expect.objectContaining({ expiresIn: '1h' }),
    );
  });

  it('rejects invalid verification code', async () => {
    const adminEmail = 'invalid@tld.com';
    await service.createDomain({ name: 'Invalid', adminEmail });

    await expect(service.verifyDomainCode(adminEmail, '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects expired verification code', async () => {
    const adminEmail = 'expired@tld.com';
    await service.createDomain({ name: 'Expired', adminEmail });
    const storeEntry = Object.values((mockContainer as any).__store)[0] as any;
    storeEntry.verificationCodeExpiresAt = new Date(Date.now() - 1000).toISOString();

    await expect(service.verifyDomainCode(adminEmail, '000000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

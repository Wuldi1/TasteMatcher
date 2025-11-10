import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { sign } from 'jsonwebtoken';
import {
  CosmosService,
  Domain,
  DomainVerificationResultResponse,
  User, // Import the User type
} from '@tastematcher/common';
import { DomainDto } from './dto/domain.dto';
import { EmailService } from '../email/email.service';

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DomainsService {
  private cosmosService: CosmosService;
  private readonly jwtSecret: string;
  private readonly vectorDimensions = 1024; // Standard vector size

  constructor(
    private readonly emailService: EmailService,
  ) {
    this.cosmosService = new CosmosService();
  
    this.jwtSecret = process.env.JWT_SECRET ?? '';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  async createDomain(domainDto: DomainDto): Promise<Domain> {
    const normalizedEmail = domainDto.adminEmail.toLowerCase().trim();
    const domainsContainer = await this.cosmosService.getDomainsContainer();

    const { resources: existingDomains } = await domainsContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.adminEmail = @adminEmail',
        parameters: [{ name: '@adminEmail', value: normalizedEmail }],
      })
      .fetchAll();

    if (existingDomains.length > 0) {
      throw new ConflictException(`Domain with admin email '${normalizedEmail}' already exists`);
    }

    const now = Date.now();
    const domainId = uuidv4();

    const newDomain: Domain = {
      id: domainId,
      name: domainDto.name,
      adminEmail: normalizedEmail,
      createdAt: now,
    };

    // Create the domain
    const { resource: createdDomain } = await domainsContainer.items.create(newDomain);

    // Create the domain_owner user
    const usersContainer = await this.cosmosService.getUsersContainer();
    const newUser: User = {
      id: uuidv4(),
      domainId: domainId,
      email: normalizedEmail,
      name: domainDto.name, // Default name, can be updated later
      role: 'domain_owner',
      preferenceVector: new Array(this.vectorDimensions).fill(0), // Initialize with zero vector
      createdAt: now,
      updatedAt: now,
    };
    await usersContainer.items.create(newUser);

    return createdDomain as Domain;
  }

  async sendVerificationCode(adminEmail: string): Promise<Domain> {
    const doc = await this.fetchDomainByEmail(adminEmail);
    return this.issueVerificationCode(doc);
  }

  async verifyDomainCode(
    adminEmail: string,
    code: string,
  ): Promise<DomainVerificationResultResponse> {
    const domain = await this.fetchDomainByEmail(adminEmail);

    if (!domain.verificationCodeHash || !domain.verificationCodeExpiresAt) {
      throw new BadRequestException('No verification code requested for this domain');
    }

    if (domain.verificationCodeExpiresAt < Date.now()) {
      throw new BadRequestException('Verification code expired');
    }

    const submittedHash = this.hashCode(code);
    if (submittedHash !== domain.verificationCodeHash) {
      throw new BadRequestException('Invalid verification code');
    }

    // Fetch the user associated with this domain's admin email
    const usersContainer = await this.cosmosService.getUsersContainer();
    const { resources: users } = await usersContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.email = @email AND c.domainId = @domainId',
        parameters: [
          { name: '@email', value: domain.adminEmail },
          { name: '@domainId', value: domain.id },
        ],
      })
      .fetchAll();

    if (users.length === 0) {
      throw new NotFoundException(`Owner user for domain '${domain.name}' not found.`);
    }
    const user = users[0] as User;

    // Clean up verification code from domain
    const domainsContainer = await this.cosmosService.getDomainsContainer();
    const updatedDomain: Domain = {
      ...domain,
      verificationCodeHash: undefined,
      verificationCodeExpiresAt: undefined,
    };
    await domainsContainer.item(updatedDomain.id, updatedDomain.adminEmail).replace(updatedDomain);

    // Sign a JWT for the USER, not the domain
    const token = sign(
      {
        sub: user.id, // Subject is now the userId
        email: user.email,
        domainId: user.domainId,
        role: user.role,
      },
      this.jwtSecret,
      { expiresIn: '4h' },
    );

    return { token };
  }

  async findDomainByEmail(adminEmail: string): Promise<Domain> {
    return await this.fetchDomainByEmail(adminEmail);
  }

  async findDomainById(domainId: string): Promise<Domain> {
    const container = await this.cosmosService.getDomainsContainer();
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.id = @domainId',
        parameters: [{ name: '@domainId', value: domainId }],
      })
      .fetchAll();

    if (resources.length === 0) {
      throw new NotFoundException(`Domain with ID '${domainId}' not found`);
    }

    return resources[0] as Domain;
  }

  private async issueVerificationCode(domain: Domain): Promise<Domain> {
    const container = await this.cosmosService.getDomainsContainer();
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).getTime();

    const updatedDomain: Domain = {
      ...domain,
      verificationCodeHash: this.hashCode(code),
      verificationCodeExpiresAt: expiresAt,
    };

    await container.item(updatedDomain.id, updatedDomain.adminEmail).replace(updatedDomain);

    await this.emailService.sendVerificationEmail({
      recipient: updatedDomain.adminEmail,
      domainName: updatedDomain.name,
      code,
      expiresAt,
    });

    return updatedDomain;
  }

  private async fetchDomainByEmail(adminEmail: string): Promise<Domain> {
    const normalizedEmail = adminEmail.toLowerCase().trim();
    const container = await this.cosmosService.getDomainsContainer();

    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.adminEmail = @adminEmail',
        parameters: [{ name: '@adminEmail', value: normalizedEmail }],
      })
      .fetchAll();

    if (resources.length === 0) {
      throw new NotFoundException(`Domain that belongs to ${adminEmail} not found`);
    }

    return resources[0] as Domain;
  }

  private generateVerificationCode(): string {
    // return randomInt(0, 1_000_000).toString().padStart(6, '0');
    return "000000";
    }

  private hashCode(code: string): string {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new BadRequestException('Verification code must be a non-empty string');
    }

    return createHash('sha256').update(code.trim()).digest('hex');
  }
}

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomInt } from "crypto";
import { sign } from "jsonwebtoken";
import {
  CosmosService,
  Domain,
  DomainRequest,
  DomainVerificationResultResponse,
  User,
} from "@tastematcher/common";
import { EmailService } from "../email/email.service";
import { CreateDomainRequestDto } from "./dto/create-domain-request.dto";
import { UpdateDomainDto } from "./dto/update-domain.dto";
import { shouldUseSecureAuthCodes } from "../config/runtime-profile";

const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const VECTOR_DIMENSIONS = 1024;

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private cosmosService: CosmosService;
  private readonly jwtSecret: string;

  constructor(private readonly emailService: EmailService) {
    this.cosmosService = new CosmosService();
    this.jwtSecret = process.env.JWT_SECRET ?? "";
    if (!this.jwtSecret) {
      throw new Error("JWT_SECRET environment variable is required");
    }
  }

  // ========== Domain Registration Flow (Public) ==========

  /**
   * Create a new domain with a domain_owner user
   * Called by global_admin or during domain registration flow
   */
  async createDomain(createDto: CreateDomainRequestDto): Promise<Domain> {
    const normalizedEmail = createDto.email.toLowerCase().trim();

    // Check for existing domain
    const existing = await this.findDomainByEmailOrNull(normalizedEmail);
    if (existing) {
      throw new ConflictException(
        `Domain with admin email '${normalizedEmail}' already exists`,
      );
    }

    const now = Date.now();
    const domainId = uuidv4();

    // Create domain
    const newDomain: Domain & { type: string; domainId: string } = {
      id: domainId,
      domainId: domainId, // Partition key for Core container
      type: "domain",
      name: createDto.proposedDomainName,
      adminEmail: normalizedEmail,
      status: "pending_verification",
      createdAt: now,
      updatedAt: now,
    };

    const domainsContainer = await this.cosmosService.getContainer("Core");
    const { resource: createdDomain } =
      await domainsContainer.items.create(newDomain);

    // Create domain_owner user
    await this.createDomainOwnerUser(
      domainId,
      normalizedEmail,
      createDto.name,
      now,
    );

    this.logger.log(`Created domain ${domainId} with owner ${normalizedEmail}`);

    return createdDomain as Domain;
  }

  /**
   * Send verification code to domain admin email
   * Returns the domain with updated verification fields
   */
  async sendVerificationCode(adminEmail: string): Promise<Domain> {
    const domain = await this.findDomainByEmail(adminEmail);
    return this.issueVerificationCode(domain);
  }

  /**
   * Verify domain code and return JWT token for the domain owner
   */
  async verifyDomainCode(
    adminEmail: string,
    code: string,
  ): Promise<DomainVerificationResultResponse> {
    const domain = await this.findDomainByEmail(adminEmail);

    // Validate verification code
    if (!domain.verificationCodeHash || !domain.verificationCodeExpiresAt) {
      throw new BadRequestException(
        "No verification code requested for this domain",
      );
    }

    if (domain.verificationCodeExpiresAt < Date.now()) {
      throw new BadRequestException("Verification code expired");
    }

    const submittedHash = this.hashCode(code);
    if (submittedHash !== domain.verificationCodeHash) {
      throw new BadRequestException("Invalid verification code");
    }

    // Find domain owner user
    const user = await this.findDomainOwnerUser(domain.id, domain.adminEmail);

    // Clear verification code
    await this.clearVerificationCode(domain);

    // Generate JWT
    const token = this.generateUserToken(user);

    this.logger.log(`Verified domain ${domain.id} for user ${user.id}`);

    return { token, user };
  }

  // ========== Global Admin Operations ==========

  /**
   * Get all domains (global_admin only)
   */
  async findAll(): Promise<Domain[]> {
    const container = await this.cosmosService.getContainer("Core");

    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'domain' ORDER BY c.createdAt DESC",
    };

    const { resources } = await container.items.query<Domain>(query).fetchAll();

    this.logger.log(`Fetched ${resources.length} domains`);
    return resources;
  }

  /**
   * Get a single domain by ID
   */
  async findOne(domainId: string): Promise<Domain> {
    const container = await this.cosmosService.getContainer("Core");

    const query = {
      query:
        "SELECT * FROM c WHERE c.id = @id AND c.domainId = @domainId AND c.type = 'domain'",
      parameters: [
        { name: "@id", value: domainId },
        { name: "@domainId", value: domainId },
      ],
    };

    const { resources } = await container.items.query<Domain>(query).fetchAll();

    if (resources.length === 0) {
      throw new NotFoundException(`Domain ${domainId} not found`);
    }

    return resources[0];
  }

  /**
   * Update domain information (global_admin only)
   */
  async update(domainId: string, updateDto: UpdateDomainDto): Promise<Domain> {
    const container = await this.cosmosService.getContainer("Core");
    const domain = await this.findOne(domainId);

    const updatedDomain: Domain = {
      ...domain,
      name: updateDto.name ?? domain.name,
      updatedAt: Date.now(),
    };

    const { resource } = await container
      .item(domainId, domainId)
      .replace(updatedDomain);

    this.logger.log(`Updated domain ${domainId}`);
    return resource as Domain;
  }

  /**
   * Delete a domain and all associated data (global_admin only)
   */
  async remove(domainId: string): Promise<void> {
    const domain = await this.findOne(domainId);

    // Delete in order: preferences -> users -> artworks -> domain
    await this.deleteAllUserPreferences(domainId);
    await this.deleteAllUsers(domainId);
    await this.deleteAllArtworks(domainId);
    await this.deleteDomainDocument(domain);

    this.logger.log(`Deleted domain ${domainId} and all associated data`);
  }

  // ========== Domain Request Operations ==========

  /**
   * Create a domain request (public - for users wanting their own domain)
   */
  async createDomainRequest(
    requestDto: CreateDomainRequestDto,
  ): Promise<DomainRequest> {
    const container = await this.cosmosService.getContainer("Proposals");
    const normalizedEmail = requestDto.email.toLowerCase().trim();

    // Check for existing pending request
    const existingQuery = {
      query:
        "SELECT * FROM c WHERE c.type = @type AND c.email = @email AND c.status = @status",
      parameters: [
        { name: "@type", value: "domainRequest" },
        { name: "@email", value: normalizedEmail },
        { name: "@status", value: "pending_verification" },
      ],
    };

    const { resources: existing } = await container.items
      .query(existingQuery)
      .fetchAll();

    if (existing.length > 0) {
      throw new BadRequestException(
        "You already have a pending domain request",
      );
    }

    // Check if user already exists in the system
    const usersContainer = await this.cosmosService.getContainer("Core");
    const userQuery = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: normalizedEmail }],
    };

    const { resources: users } = await usersContainer.items
      .query(userQuery)
      .fetchAll();

    if (users.length > 0) {
      throw new BadRequestException(
        "An account with this email already exists. Please use the login page.",
      );
    }

    const newRequest: DomainRequest = {
      id: uuidv4(),
      type: "domainRequest",
      domainId: "domain-requests",
      email: normalizedEmail,
      name: requestDto.name,
      proposedDomainName: requestDto.proposedDomainName,
      message: requestDto.message,
      status: "pending_verification",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { resource } = await container.items.create(newRequest);

    this.logger.log(
      `Created domain request ${newRequest.id} for ${normalizedEmail}`,
    );

    return resource as DomainRequest;
  }

  /**
   * Get all domain requests (global_admin only)
   */
  async getAllDomainRequests(): Promise<DomainRequest[]> {
    const container = await this.cosmosService.getContainer("Proposals");

    const query = {
      query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.createdAt DESC",
      parameters: [{ name: "@type", value: "domainRequest" }],
    };

    const { resources } = await container.items
      .query<DomainRequest>(query)
      .fetchAll();

    this.logger.log(`Fetched ${resources.length} domain requests`);
    return resources;
  }

  /**
   * Create a new domain or resend verification if it already exists (global_admin only)
   */
  async createOrResendDomain(
    createDto: CreateDomainRequestDto,
  ): Promise<Domain> {
    // Check if domain already exists
    const existingDomain = await this.findDomainByEmailOrNull(
      createDto.email.toLowerCase().trim(),
    );

    if (existingDomain) {
      // Domain exists - resend verification code
      this.logger.log(
        `Domain already exists for ${createDto.email}, resending verification`,
      );
      await this.issueInviteEmail(existingDomain);
      return existingDomain;
    }

    // Create new domain
    const newDomain = await this.createDomain(createDto);

    // Send verification code to new domain
    await this.issueInviteEmail(newDomain);

    return newDomain;
  }

  /**
   * Create domain and admin user for testing purposes
   * ⚠️ THIS SHOULD ONLY BE USED FOR TESTING - DISABLE IN PRODUCTION
   */
  async createDomainWithAdmin(dto: CreateDomainRequestDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check for existing domain
    const existing = await this.findDomainByEmailOrNull(normalizedEmail);
    if (existing) {
      throw new ConflictException(
        `Domain with admin email '${normalizedEmail}' already exists`,
      );
    }

    const now = Date.now();
    const domainId = uuidv4();

    // Create domain
    const newDomain: Domain & { type: string; domainId: string } = {
      id: domainId,
      domainId: domainId,
      type: "domain",
      name: dto.proposedDomainName,
      adminEmail: normalizedEmail,
      status: "active", // Set as active immediately for testing
      createdAt: now,
      updatedAt: now,
    };

    const domainsContainer = await this.cosmosService.getContainer("Core");
    await domainsContainer.items.create(newDomain);

    // Create domain_owner user with active status
    const usersContainer = await this.cosmosService.getContainer("Core");
    const newUser: User & { type: string } = {
      id: uuidv4(),
      domainId: domainId,
      type: "user",
      email: normalizedEmail,
      name: dto.name,
      role: "domain_owner",
      status: "active", // Set as active immediately for testing
      onboardingStatus: "not_started",
      preferenceVector: new Array(VECTOR_DIMENSIONS).fill(0),
      createdAt: now,
      updatedAt: now,
    };

    await usersContainer.items.create(newUser);

    this.logger.log(
      `[TEST] Created domain ${domainId} with admin user ${newUser.id} for ${normalizedEmail}`,
    );
  }

  // ========== Helper Methods ==========

  /**
   * Find domain by email (throws if not found)
   */
  async findDomainByEmail(adminEmail: string): Promise<Domain> {
    const domain = await this.findDomainByEmailOrNull(adminEmail);
    if (!domain) {
      throw new NotFoundException(
        `Domain with admin email '${adminEmail}' not found`,
      );
    }
    return domain;
  }

  /**
   * Find domain by email (returns null if not found)
   */
  private async findDomainByEmailOrNull(
    adminEmail: string,
  ): Promise<Domain | null> {
    const normalizedEmail = adminEmail.toLowerCase().trim();
    const container = await this.cosmosService.getContainer("Core");

    // Cross-partition query (acceptable for low volume of domains)
    const { resources } = await container.items
      .query({
        query:
          "SELECT * FROM c WHERE c.adminEmail = @adminEmail AND c.type = 'domain'",
        parameters: [{ name: "@adminEmail", value: normalizedEmail }],
      })
      .fetchAll();

    return resources.length > 0 ? (resources[0] as Domain) : null;
  }

  /**
   * Find domain by ID (alias for findOne for consistency)
   */
  async findDomainById(domainId: string): Promise<Domain> {
    return this.findOne(domainId);
  }

  /**
   * Create domain owner user
   */
  private async createDomainOwnerUser(
    domainId: string,
    email: string,
    name: string,
    timestamp: number,
  ): Promise<User> {
    const usersContainer = await this.cosmosService.getContainer("Core");

    const newUser: User & { type: string } = {
      id: uuidv4(),
      domainId,
      type: "user",
      email,
      name,
      role: "domain_owner",
      status: "pending_verification",
      onboardingStatus: "not_started",
      preferenceVector: new Array(VECTOR_DIMENSIONS).fill(0),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await usersContainer.items.create(newUser);
    return newUser;
  }

  /**
   * Find domain owner user
   */
  private async findDomainOwnerUser(
    domainId: string,
    email: string,
  ): Promise<User> {
    const usersContainer = await this.cosmosService.getContainer("Core");

    const { resources: users } = await usersContainer.items
      .query({
        query:
          "SELECT * FROM c WHERE c.email = @email AND c.domainId = @domainId AND c.type = 'user'",
        parameters: [
          { name: "@email", value: email },
          { name: "@domainId", value: domainId },
        ],
      })
      .fetchAll();

    if (users.length === 0) {
      throw new NotFoundException(
        `Owner user for domain '${domainId}' not found`,
      );
    }

    return users[0] as User;
  }

  private async issueInviteEmail(domain: Domain): Promise<void> {
    await this.emailService.sendUserInvitation(
      domain.adminEmail,
      domain.name,
      domain.id,
      "domain_owner",
    );
    this.logger.log(`Sent invite email to ${domain.adminEmail}`);
  }

  /**
   * Issue verification code and send email
   */
  private async issueVerificationCode(domain: Domain): Promise<Domain> {
    const container = await this.cosmosService.getContainer("Core");
    const code = this.generateVerificationCode();
    const expiresAt = Date.now() + VERIFICATION_TTL_MS;

    const updatedDomain: Domain = {
      ...domain,
      verificationCodeHash: this.hashCode(code),
      verificationCodeExpiresAt: expiresAt,
    };

    await container
      .item(updatedDomain.id, updatedDomain.id) // PK is domainId
      .replace(updatedDomain);

    await this.emailService.sendVerificationEmail({
      recipient: updatedDomain.adminEmail,
      domainName: updatedDomain.name,
      code,
      expiresAt,
    });

    this.logger.log(`Sent verification code to ${updatedDomain.adminEmail}`);

    return updatedDomain;
  }

  /**
   * Clear verification code from domain and mark as active
   */
  private async clearVerificationCode(domain: Domain): Promise<void> {
    const container = await this.cosmosService.getContainer("Core");

    const updatedDomain: Domain = {
      ...domain,
      status: "active",
      verificationCodeHash: undefined,
      verificationCodeExpiresAt: undefined,
    };

    await container
      .item(updatedDomain.id, updatedDomain.id) // PK is domainId
      .replace(updatedDomain);
  }

  /**
   * Generate JWT token for user
   */
  private generateUserToken(user: User): string {
    return sign(
      {
        id: user.id,
        email: user.email,
        domainId: user.domainId,
        role: user.role,
      },
      this.jwtSecret,
      { expiresIn: "4h" },
    );
  }

  /**
   * Generate 6-digit verification code
   */
  private generateVerificationCode(): string {
    if (shouldUseSecureAuthCodes()) {
      return randomInt(0, 1_000_000).toString().padStart(6, "0");
    }
    return "000000";
  }

  /**
   * Hash verification code
   */
  private hashCode(code: string): string {
    if (typeof code !== "string" || code.trim().length === 0) {
      throw new BadRequestException(
        "Verification code must be a non-empty string",
      );
    }
    return createHash("sha256").update(code.trim()).digest("hex");
  }

  /**
   * Delete all user preferences for a domain
   */
  private async deleteAllUserPreferences(domainId: string): Promise<void> {
    const usersContainer = await this.cosmosService.getContainer("Core");
    const preferencesContainer =
      await this.cosmosService.getContainer("Artworks");

    // Get all users in domain
    const usersQuery = {
      query: "SELECT * FROM c WHERE c.domainId = @domainId",
      parameters: [{ name: "@domainId", value: domainId }],
    };

    const { resources: users } = await usersContainer.items
      .query(usersQuery)
      .fetchAll();

    // Delete preferences for each user
    for (const user of users) {
      const prefsQuery = {
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId",
        parameters: [
          { name: "@type", value: "artworkPreference" },
          { name: "@domainId", value: domainId },
          { name: "@userId", value: user.id },
        ],
      };

      const { resources: prefs } = await preferencesContainer.items
        .query(prefsQuery, { partitionKey: domainId })
        .fetchAll();

      await Promise.all(
        prefs.map((pref) =>
          preferencesContainer.item(pref.id, domainId).delete(),
        ),
      );
    }

    this.logger.debug(
      `Deleted preferences for ${users.length} users in domain ${domainId}`,
    );
  }

  /**
   * Delete all users in a domain
   */
  private async deleteAllUsers(domainId: string): Promise<void> {
    const usersContainer = await this.cosmosService.getContainer("Core");

    const usersQuery = {
      query: "SELECT * FROM c WHERE c.domainId = @domainId AND c.type = 'user'",
      parameters: [{ name: "@domainId", value: domainId }],
    };

    const { resources: users } = await usersContainer.items
      .query(usersQuery)
      .fetchAll();

    await Promise.all(
      users.map((user) => usersContainer.item(user.id, domainId).delete()),
    );

    this.logger.debug(`Deleted ${users.length} users from domain ${domainId}`);
  }

  /**
   * Delete all artworks in a domain
   */
  private async deleteAllArtworks(domainId: string): Promise<void> {
    const artworksContainer = await this.cosmosService.getContainer("Artworks");

    const artworksQuery = {
      query: "SELECT * FROM c WHERE c.domainId = @domainId",
      parameters: [{ name: "@domainId", value: domainId }],
    };

    const { resources: artworks } = await artworksContainer.items
      .query(artworksQuery)
      .fetchAll();

    await Promise.all(
      artworks.map((artwork) =>
        artworksContainer.item(artwork.id, domainId).delete(),
      ),
    );

    this.logger.debug(
      `Deleted ${artworks.length} artworks from domain ${domainId}`,
    );
  }

  /**
   * Delete domain document
   */
  private async deleteDomainDocument(domain: Domain): Promise<void> {
    const domainsContainer = await this.cosmosService.getContainer("Core");
    await domainsContainer.item(domain.id, domain.id).delete(); // PK is domainId
  }
}

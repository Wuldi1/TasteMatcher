import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { sign } from "jsonwebtoken";
import { createHash, randomInt } from "crypto";
import {
  CosmosService,
  User,
  DomainVerificationResultResponse,
} from "@tastematcher/common";
import { LoginRequestDto } from "./dto/login-request.dto";
import { LoginVerifyDto } from "./dto/login-verify.dto";
import { EmailService } from "../email/email.service";

const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly cosmosService: CosmosService;
  private readonly isPrd?: boolean;
  private readonly jwtSecret: string;

  constructor(private readonly emailService: EmailService) {
    this.cosmosService = new CosmosService();
    this.jwtSecret = process.env.JWT_SECRET ?? "";
    this.isPrd = process.env.NODE_ENV === "prd";

    if (!this.jwtSecret) {
      throw new Error("JWT_SECRET environment variable is required");
    }
  }

  /**
   * Request login verification code
   * Finds user by email and sends verification code
   */
  async requestLoginCode(
    loginDto: LoginRequestDto,
  ): Promise<{ message: string }> {
    const normalizedEmail = loginDto.email.toLowerCase().trim();
    const usersContainer = await this.cosmosService.getContainer("Core");

    console.log("Processing login request for email:", normalizedEmail);

    // Find user by email across all domains
    const query = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: normalizedEmail }],
    };

    const { resources: users } = await usersContainer.items
      .query(query)
      .fetchAll();

    console.log(`Found ${users.length} users for email: ${normalizedEmail}`);

    if (users.length === 0) {
      throw new NotFoundException("No account found with this email address");
    }

    const user = users[0];
    console.log("Found user for login request:", user);

    // Generate verification code
    const code = this.generateVerificationCode();
    const expiresAt = Date.now() + VERIFICATION_TTL_MS;

    // Update user with verification code
    const updatedUser: User = {
      ...user,
      verificationCodeHash: this.hashCode(code),
      verificationCodeExpiresAt: expiresAt,
    };

    console.log("Updating user with verification code hash:", updatedUser);
    await usersContainer.item(user.id, user.domainId).replace(updatedUser);

    // Get domain info using domainId only
    const domainsContainer = await this.cosmosService.getContainer("Core");
    const { resource: domain } = await domainsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @domainId",
        parameters: [{ name: "@domainId", value: user.domainId }],
      })
      .fetchAll()
      .then((res) => ({ resource: res.resources[0] }));

    if (!domain) {
      throw new NotFoundException("Domain not found");
    }
    console.log("Found domain for login request:", domain);

    // Send verification email
    await this.emailService.sendVerificationEmail({
      recipient: user.email,
      domainName: domain.name,
      code,
      expiresAt,
    });

    this.logger.log(`Sent login verification code to ${user.email}`);

    return { message: "Verification code sent to your email" };
  }

  /**
   * Verify login code and return JWT token
   * Updates user and domain status to active
   */
  async verifyLoginCode(
    verifyDto: LoginVerifyDto,
  ): Promise<DomainVerificationResultResponse> {
    const normalizedEmail = verifyDto.email.toLowerCase().trim();
    const usersContainer = await this.cosmosService.getContainer("Core");
    const domainsContainer = await this.cosmosService.getContainer("Core");

    // Find user by email
    const query = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: normalizedEmail }],
    };

    const { resources: users } = await usersContainer.items
      .query<User>(query)
      .fetchAll();

    if (users.length === 0) {
      throw new NotFoundException("No account found with this email address");
    }

    const user = users[0];

    // Validate verification code
    if (!user.verificationCodeHash || !user.verificationCodeExpiresAt) {
      throw new BadRequestException(
        "No verification code requested for this account",
      );
    }

    if (user.verificationCodeExpiresAt < Date.now()) {
      throw new BadRequestException("Verification code expired");
    }

    const submittedHash = this.hashCode(verifyDto.code);
    if (submittedHash !== user.verificationCodeHash) {
      throw new BadRequestException("Invalid verification code");
    }

    // Update user status to active and clear verification code
    const updatedUser: User = {
      ...user,
      status: "active",
      verificationCodeHash: undefined,
      verificationCodeExpiresAt: undefined,
      updatedAt: Date.now(),
    };

    await usersContainer.item(user.id, user.domainId).replace(updatedUser);

    // Update domain status to active if needed
    const { resource: domain } = await domainsContainer
      .item(user.domainId, user.domainId)
      .read();

    if (domain && domain.status !== "active") {
      const updatedDomain = {
        ...domain,
        status: "active" as const,
        verificationCodeHash: undefined,
        verificationCodeExpiresAt: undefined,
        updatedAt: Date.now(),
      };

      await domainsContainer
        .item(domain.id, domain.domainId)
        .replace(updatedDomain);
    }

    const token = this.generateUserToken(updatedUser);

    this.logger.log(`User ${user.id} logged in successfully`);

    return { token, user: updatedUser };
  }

  /**
   * Generate JWT token for user
   */
  public generateUserToken(user: User): string {
    return sign(
      {
        id: user.id,
        email: user.email,
        domainId: user.domainId,
        role: user.role,
        name: user.name,
      },
      this.jwtSecret,
      { expiresIn: "7d" },
    );
  }

  /**
   * Generate 6-digit verification code
   */
  private generateVerificationCode(): string {
    if (this.isPrd) {
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
}

import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginRequestDto } from "./dto/login-request.dto";
import { LoginVerifyDto } from "./dto/login-verify.dto";
import { CreateDomainRequestDto } from "../domains/dto/create-domain-request.dto";
import { CreateCustomerRequestDto } from "../users/dto/create-customer-request.dto";
import {
  DomainVerificationResultResponse,
  DomainRequest,
  CustomerRequest,
} from "@tastematcher/common";
import { DomainsService } from "../domains/domains.service";
import { UsersService } from "../users/users.service";
import { isProductionDataTarget } from "../config/runtime-profile";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly domainsService: DomainsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Request login verification code
   * Public endpoint - no authentication required
   */
  @Post("login/request")
  @HttpCode(HttpStatus.OK)
  async requestLogin(
    @Body() loginDto: LoginRequestDto,
  ): Promise<{ message: string }> {
    return this.authService.requestLoginCode(loginDto);
  }

  /**
   * Verify login code and get JWT token
   * Public endpoint - no authentication required
   */
  @Post("login/verify")
  @HttpCode(HttpStatus.OK)
  async verifyLogin(
    @Body() verifyDto: LoginVerifyDto,
  ): Promise<DomainVerificationResultResponse> {
    return this.authService.verifyLoginCode(verifyDto);
  }

  /**
   * Create a domain request for sellers wanting to join TasteMatcher
   * Public endpoint - no authentication required
   */
  @Post("domain-request")
  @HttpCode(HttpStatus.CREATED)
  async createDomainRequest(
    @Body() requestDto: CreateDomainRequestDto,
  ): Promise<DomainRequest> {
    return this.domainsService.createDomainRequest(requestDto);
  }

  /**
   * Create a customer request (public)
   */
  @Post("customer-request")
  @HttpCode(HttpStatus.CREATED)
  async createCustomerRequest(
    @Body() requestDto: CreateCustomerRequestDto,
  ): Promise<CustomerRequest> {
    return this.usersService.createCustomerRequest(requestDto);
  }

  /**
   * ⚠️ TESTING ONLY - Create domain and admin user without verification
   * This endpoint should be disabled in production environments
   * Creates both domain and user with active status immediately
   */
  @Post("test/create-domain")
  @HttpCode(HttpStatus.CREATED)
  async createDomainForTesting(
    @Body() dto: CreateDomainRequestDto,
  ): Promise<void> {
    // Add environment check - only allow in development
    if (
      process.env.NODE_ENV === "development" &&
      !isProductionDataTarget()
    ) {
      await this.domainsService.createDomainWithAdmin(dto);
      return;
    }

    throw new Error("This endpoint is disabled in production");
  }
}

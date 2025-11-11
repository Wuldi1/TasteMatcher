import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginVerifyDto } from './dto/login-verify.dto';
import { CreateDomainRequestDto } from '../domains/dto/create-domain-request.dto';
import { DomainVerificationResultResponse, DomainRequest } from '@tastematcher/common';
import { DomainsService } from '../domains/domains.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly domainsService: DomainsService,
  ) {}

  /**
   * Request login verification code
   * Public endpoint - no authentication required
   */
  @Post('login/request')
  @HttpCode(HttpStatus.OK)
  async requestLogin(@Body() loginDto: LoginRequestDto): Promise<{ message: string }> {
    return this.authService.requestLoginCode(loginDto);
  }

  /**
   * Verify login code and get JWT token
   * Public endpoint - no authentication required
   */
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  async verifyLogin(@Body() verifyDto: LoginVerifyDto): Promise<DomainVerificationResultResponse> {
    return this.authService.verifyLoginCode(verifyDto);
  }

  /**
   * Create a domain request for sellers wanting to join TasteMatcher
   * Public endpoint - no authentication required
   */
  @Post('domain-request')
  @HttpCode(HttpStatus.CREATED)
  async createDomainRequest(@Body() requestDto: CreateDomainRequestDto): Promise<DomainRequest> {
    return this.domainsService.createDomainRequest(requestDto);
  }
}

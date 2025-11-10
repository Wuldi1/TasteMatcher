import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ValidationPipe,
  Logger,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DomainsService } from './domains.service';
import { Domain, DomainVerificationResultResponse } from '@tastematcher/common';
import { DomainDto } from './dto/domain.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request.interface';

@ApiTags('domains')
@Controller('api/domains')
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);

  constructor(private readonly domainsService: DomainsService) {}

  @Get('auth/:adminEmail')
  async requestVerificationForExisting(
    @Param('adminEmail') adminEmail: string,
  ): Promise<Domain> {
    this.logger.debug({ route: 'GET /api/domains/auth/:adminEmail', adminEmail });
    return this.domainsService.sendVerificationCode(adminEmail);
  }

  @Get(':domainId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getDomain(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
  ): Promise<Domain> {
    this.logger.debug({ route: 'GET /api/domains/:domainId', domainId, userId: req.user.id });
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.domainsService.findDomainById(domainId);
  }

  @Post()
  async createDomain(
    @Body(ValidationPipe) domainDto: DomainDto,
  ): Promise<Domain> {
    this.logger.debug({ route: 'POST /api/domains', email: domainDto.adminEmail });
    const domain = await this.domainsService.createDomain(domainDto);
    await this.domainsService.sendVerificationCode(domainDto.adminEmail);
    return domain;
  }

  @Post('verify/:adminEmail')
  async verifyDomain(
    @Param('adminEmail') adminEmail: string,
    @Body(ValidationPipe) payload: { code: string },
  ): Promise<DomainVerificationResultResponse> {
    this.logger.debug({ route: 'POST /api/domains/verify/:adminEmail', adminEmail, payload });
    return this.domainsService.verifyDomainCode(adminEmail, payload.code);
  }
}

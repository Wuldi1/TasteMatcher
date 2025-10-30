import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { Domain, DomainVerificationResultResponse } from 'common';
import { DomainDto } from './dto/domain.dto';

@Controller('domain')
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);

  constructor(private readonly domainsService: DomainsService) {}

  @Get(':adminEmail')
  async requestVerificationForExisting(
    @Param('adminEmail') adminEmail: string,
  ): Promise<Domain> {
    this.logger.debug({ route: 'GET /domain/:adminEmail', adminEmail });
    return this.domainsService.sendVerificationCode(adminEmail);
  }

  @Post()
  async createDomain(
    @Body(ValidationPipe) domainDto: DomainDto,
  ): Promise<Domain> {
    this.logger.debug({ route: 'POST /domain', email: domainDto.adminEmail });
    const domain = await this.domainsService.createDomain(domainDto);
    await this.domainsService.sendVerificationCode(domainDto.adminEmail);
    return domain;
  }

  @Post(':adminEmail/verify')
  async verifyDomain(
    @Param('adminEmail') adminEmail: string,
    @Body(ValidationPipe) payload: { code: string },
  ): Promise<DomainVerificationResultResponse> {
    this.logger.debug({ route: 'POST /domain/:adminEmail/verify', adminEmail, payload });
    return this.domainsService.verifyDomainCode(adminEmail, payload.code);
  }
}

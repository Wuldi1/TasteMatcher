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
import { Domain } from 'common';
import { DomainDto } from './dto/domain.dto'

@Controller('domains')
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);

  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  async createDomain(
    @Body(ValidationPipe) createDomainDto: DomainDto,
  ): Promise<Domain> {
    this.logger.log(
      `Creating domain: ${createDomainDto.name} for admin: ${createDomainDto.adminEmail}`,
    );
    return this.domainsService.createDomain(createDomainDto);
  }

  @Get(':adminEmail')
  async getDomainByAdminEmail(
    @Param('adminEmail') adminEmail: string,
  ): Promise<Domain> {
    this.logger.log(`Fetching domain via email: ${adminEmail}`);
    return this.domainsService.getDomainByEmail(adminEmail);
  }
}

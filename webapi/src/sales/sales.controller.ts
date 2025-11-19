import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/utils/jwt-auth.guard';
import { RolesGuard } from '../auth/utils/roles.guard';
import { Roles } from '../auth/utils/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request.interface';
import { Proposal } from '@tastematcher/common';

@ApiTags('sales')
@Controller('api/domains/:domainId/sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // List proposals for domain (optionally filter by userId)
  @Get('proposals')
  @Roles('dealer', 'domain_owner', 'global_admin')
  @ApiOperation({ summary: 'List proposals for domain (optionally filter by userId)' })
  async listProposals(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId?: string,
    @Query('userId') userId?: string,
  ) {
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.salesService.findAll(domainId ?? req.user.domainId, userId ?? req.user.id);
  }

  @Get('proposals/:proposalId')
  @Roles('dealer', 'domain_owner', 'global_admin')
  async getProposal(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<Proposal> {
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.salesService.getProposal(domainId, proposalId);
  }

  @Post('proposals')
  @Roles('dealer', 'domain_owner', 'global_admin')
  @ApiOperation({ summary: 'Create proposal' })
  async createProposal(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Body() proposal: Partial<Proposal>,
  ): Promise<Proposal> {
    // Domain match check
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.salesService.createProposal(domainId, proposal, req.user);
  }

  @Patch('proposals/:proposalId')
  @Roles('dealer', 'domain_owner', 'global_admin')
  @ApiOperation({ summary: 'Update proposal' })
  async updateProposal(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('proposalId') proposalId: string,
    @Body() update: Partial<Proposal>,
  ): Promise<Proposal> {
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }

    return this.salesService.updateProposal(domainId, proposalId, update, req.user);
  }

  @Delete('proposals/:proposalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('dealer', 'domain_owner', 'global_admin')
  @ApiOperation({ summary: 'Delete proposal' })
  async deleteProposal(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.salesService.removeProposal(domainId, proposalId, req.user);
  }

  @Post('proposals/:proposalId/ping')
  @Roles('dealer', 'domain_owner', 'global_admin')
  @ApiOperation({ summary: 'Ping customer (send reminder email) about proposal' })
  async pingCustomer(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId && req.user.role !== 'global_admin') {
      throw new ForbiddenException('You are not authorized to access this domain.');
    }
    return this.salesService.pingCustomer(domainId, proposalId, req.user);
  }
}

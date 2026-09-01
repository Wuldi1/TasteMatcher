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
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { SalesService } from "./sales.service";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { RolesGuard } from "../auth/utils/roles.guard";
import { Roles } from "../auth/utils/roles.decorator";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import {
  GeneratedProposalDraft,
  GenerateProposalDraftRequest,
  Proposal,
  RecordProposalEngagementRequest,
  ProposalGenerationEligibility,
} from "@tastematcher/common";

@ApiTags("sales")
@Controller("domains/:domainId/sales")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // List proposals for domain (optionally filter by userId)
  @Get("proposals")
  @Roles("customer", "dealer", "domain_owner", "global_admin")
  @ApiOperation({
    summary: "List proposals for domain (optionally filter by userId)",
  })
  async listProposals(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId?: string,
    @Query("userId") userId?: string,
    @Query("dealerUserId") dealerUserId?: string,
  ): Promise<Proposal[]> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    if (req.user.role === "customer" && req.user.id !== userId) {
      throw new ForbiddenException(
        "Customers can only access their own proposals.",
      );
    }
    let requestedDomainId;
    let requestedUserId;
    let requestedDealerUserId;

    if (req.user.role === "customer") {
      requestedDomainId = req.user.domainId;
      requestedUserId = req.user.id;
    } else if (req.user.role === "dealer") {
      requestedDomainId = req.user.domainId;
      requestedUserId = undefined;
      requestedDealerUserId = req.user.id;
    } else if (req.user.role === "domain_owner") {
      requestedDomainId = req.user.domainId;
      requestedUserId = undefined;
      requestedDealerUserId = undefined;
    } else {
      // global_admin
      requestedDomainId = domainId ?? req.user.domainId;
      requestedUserId = userId ?? undefined;
      requestedDealerUserId = dealerUserId ?? undefined;
    }

    return this.salesService.findAll(
      requestedDomainId,
      requestedUserId,
      requestedDealerUserId,
      req.user.role !== "customer",
    );
  }

  @Get("proposals/ai-generation-eligibility")
  @Roles("dealer", "domain_owner", "global_admin")
  @ApiOperation({ summary: "Check customer readiness for an AI proposal" })
  async getAIProposalEligibility(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Query("userId") userId: string,
  ): Promise<ProposalGenerationEligibility> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.getAIDraftEligibility(domainId, userId, req.user);
  }

  @Get("proposals/:proposalId")
  @Roles("customer", "dealer", "domain_owner", "global_admin")
  async getProposal(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("proposalId") proposalId: string,
  ): Promise<Proposal> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    const proposal = await this.salesService.getProposal(domainId, proposalId);
    if (req.user.role === "customer" && req.user.id !== proposal.userId) {
      throw new ForbiddenException(
        "Customers can only access their own proposals.",
      );
    }
    if (req.user.role === "customer" && proposal.status === "draft") {
      throw new ForbiddenException(
        "Draft proposals are not visible to customers.",
      );
    }
    return proposal;
  }

  @Post("proposals")
  @Roles("dealer", "domain_owner", "global_admin")
  @ApiOperation({ summary: "Create proposal" })
  async createProposal(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Body() proposal: Partial<Proposal>,
  ): Promise<Proposal> {
    // Domain match check
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.createProposal(domainId, proposal, req.user);
  }

  @Post("proposals/ai-generated-draft")
  @Roles("dealer", "domain_owner", "global_admin")
  @ApiOperation({ summary: "Generate editable AI proposal draft" })
  async generateAIProposalDraft(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Body() body: GenerateProposalDraftRequest,
  ): Promise<GeneratedProposalDraft> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.generateAIDraft(
      domainId,
      body.userId,
      req.user,
      body.limit,
    );
  }

  @Post("proposals/:proposalId/engagement")
  @Roles("customer")
  @ApiOperation({ summary: "Record customer engagement with a proposal" })
  async recordProposalEngagement(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("proposalId") proposalId: string,
    @Body() body: RecordProposalEngagementRequest,
  ): Promise<Proposal> {
    if (req.user.domainId !== domainId) {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.recordCustomerEngagement(
      domainId,
      proposalId,
      req.user,
      body,
    );
  }

  @Patch("proposals/:proposalId")
  @Roles("customer", "dealer", "domain_owner", "global_admin")
  @ApiOperation({ summary: "Update proposal" })
  async updateProposal(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("proposalId") proposalId: string,
    @Body() update: Partial<Proposal>,
  ): Promise<Proposal> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }

    const proposal = await this.salesService.getProposal(domainId, proposalId);
    if (req.user.role === "customer" && req.user.id !== proposal.userId) {
      throw new ForbiddenException(
        "Customers can only access their own proposals.",
      );
    }
    if (req.user.role === "customer" && proposal.status === "draft") {
      throw new ForbiddenException(
        "Draft proposals cannot be updated by customers.",
      );
    }

    return this.salesService.updateProposal(
      domainId,
      proposalId,
      update,
      req.user,
    );
  }

  @Delete("proposals/:proposalId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("dealer", "domain_owner", "global_admin")
  @ApiOperation({ summary: "Delete proposal" })
  async deleteProposal(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("proposalId") proposalId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.removeProposal(domainId, proposalId, req.user);
  }

  @Post("proposals/:proposalId/ping")
  @Roles("dealer", "domain_owner", "global_admin")
  @ApiOperation({
    summary: "Ping customer (send reminder email) about proposal",
  })
  async pingCustomer(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("proposalId") proposalId: string,
  ): Promise<void> {
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.salesService.pingCustomer(domainId, proposalId, req.user);
  }
}

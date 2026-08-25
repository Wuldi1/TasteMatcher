import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { CosmosService, Proposal } from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";
import { EmailService } from "../email/email.service";
import { UsersService } from "../users/users.service";
import { AuthenticatedUser } from "../auth/types/authenticated-request.interface";
import { DomainsService } from "../domains/domains.service";
import { DomainActivityService } from "../activity/domain-activity.service";
import { ProductActivityLoggerService } from "../activity/product-activity-logger.service";

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);
  private readonly cosmosService: CosmosService;

  constructor(
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly domainsService: DomainsService,
    private readonly domainActivityService: DomainActivityService,
    private readonly productActivityLogger?: ProductActivityLoggerService,
  ) {
    this.cosmosService = new CosmosService();
  }

  private async getContainer() {
    return this.cosmosService.getContainer("Proposals");
  }

  /**
   * Create proposal and notify customer
   */
  async createProposal(
    domainId: string,
    proposal: Partial<Proposal>,
    requestingUser: AuthenticatedUser,
  ): Promise<Proposal> {
    if (!proposal.userId) throw new BadRequestException("userId required");
    const container = await this.getContainer();

    // authorization handled in controller - service trusts caller but double-check domain
    const newProposal: Proposal = {
      id: uuidv4(),
      type: "proposal",
      domainId,
      userId: proposal.userId!,
      dealerId: proposal.dealerId ?? requestingUser.id,
      items: proposal.items ?? [],
      metadata: proposal.metadata ?? {},
      generalComments: proposal.generalComments ?? [],
      status: (proposal as any).status ?? "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      submittedAt:
        ((proposal as any).status ?? "draft") === "submitted"
          ? Date.now()
          : undefined,
    };

    const { resource } = await container.items.create(newProposal);
    if ((resource as Proposal)?.status !== "draft") {
      await this.notifyProposalUpdate(
        resource as Proposal,
        requestingUser,
        "created",
      );
    }
    this.productActivityLogger?.log("proposal.created", {
      proposalStatus: String((resource as Proposal).status ?? "draft"),
    });

    this.logger.log(
      `Created proposal ${resource?.id} for user ${resource?.userId}`,
    );
    return resource as Proposal;
  }

  /**
   * Get a proposal by id
   */
  async getProposal(domainId: string, proposalId: string): Promise<Proposal> {
    const container = await this.getContainer();
    try {
      const { resource } = await container
        .item(proposalId, domainId)
        .read<Proposal>();
      if (!resource) throw new NotFoundException("Proposal not found");
      return resource;
    } catch (err) {
      this.logger.error(`Failed to read proposal ${proposalId}`, err);
      throw new NotFoundException("Proposal not found");
    }
  }

  /**
   * List proposals for a domain (optionally filtered by userId)
   */
  async findAll(
    domainId: string,
    userId?: string,
    dealerUserId?: string,
    includeDrafts = true,
  ): Promise<Proposal[]> {
    const container = await this.getContainer();
    let questProperties;

    if (dealerUserId) {
      questProperties = {
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.dealerId = @dealerUserId ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@type", value: "proposal" },
          { name: "@domainId", value: domainId },
          { name: "@dealerUserId", value: dealerUserId },
        ],
      };
    } else if (userId) {
      questProperties = {
        query: includeDrafts
          ? "SELECT * FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId ORDER BY c.createdAt DESC"
          : "SELECT * FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId AND (NOT IS_DEFINED(c.status) OR c.status != @draftStatus) ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@type", value: "proposal" },
          { name: "@domainId", value: domainId },
          { name: "@userId", value: userId },
          ...(includeDrafts
            ? []
            : [{ name: "@draftStatus", value: "draft" }]),
        ],
      };
    } else {
      questProperties = {
        query:
          "SELECT * FROM c WHERE c.type = @type AND c.domainId = @domainId ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@type", value: "proposal" },
          { name: "@domainId", value: domainId },
        ],
      };
    }

    const { resources } = await container.items
      .query<Proposal>(questProperties)
      .fetchAll();
    return resources;
  }

  /**
   * Update proposal and notify customer
   */
  async updateProposal(
    domainId: string,
    proposalId: string,
    update: Partial<Proposal>,
    requestingUser: AuthenticatedUser,
  ): Promise<Proposal> {
    const container = await this.getContainer();
    const existing = await this.getProposal(domainId, proposalId);

    // Apply updates
    const updated: Proposal = {
      ...existing,
      type: "proposal",
      items: update.items ?? existing.items,
      metadata: update.metadata ?? existing.metadata,
      generalComments: update.generalComments ?? existing.generalComments,
      dealerId: update.dealerId ?? existing.dealerId,
      status: (update as any).status ?? existing.status,
      updatedAt: Date.now(),
      submittedAt:
        ((update as any).status ?? existing.status) === "submitted"
          ? existing.submittedAt ?? Date.now()
          : existing.submittedAt,
    };

    const { resource } = await container
      .item(proposalId, domainId)
      .replace(updated as any);
    if ((resource as Proposal)?.status !== "draft") {
      await this.notifyProposalUpdate(
        resource as Proposal,
        requestingUser,
        "updated",
      );
    }
    await this.domainActivityService.recordActivity({
      domainId,
      activityType: "proposal_updated",
      userId: requestingUser.id,
      userEmail: requestingUser.email,
      metadata: { proposalId },
    });

    const savedProposal = resource as Proposal;
    if (savedProposal.status !== existing.status) {
      this.productActivityLogger?.log("proposal.status_changed", {
        previousProposalStatus: String(existing.status ?? "draft"),
        proposalStatus: String(savedProposal.status ?? "draft"),
      });
    }
    if (this.countComments(savedProposal) > this.countComments(existing)) {
      this.productActivityLogger?.log("proposal.comment_added");
    }

    this.logger.log(`Updated proposal ${proposalId}`);
    return resource as Proposal;
  }

  private countComments(proposal: Proposal): number {
    return (
      (proposal.generalComments?.length ?? 0) +
      (proposal.items ?? []).reduce(
        (total, item) => total + (item.comments?.length ?? 0),
        0,
      )
    );
  }

  /**
   * Delete proposal and notify customer
   */
  async removeProposal(
    domainId: string,
    proposalId: string,
    requestingUser: AuthenticatedUser,
  ): Promise<void> {
    const container = await this.getContainer();
    const existing = await this.getProposal(domainId, proposalId);

    await container.item(proposalId, domainId).delete();
    try {
      const customer = await this.usersService.findOne(
        domainId,
        existing.userId,
      );
      await this.emailService.sendProposalNotification?.(
        customer.email,
        existing,
        "deleted",
      );
    } catch (err) {
      this.logger.warn("Failed to send proposal deletion notification", err);
    }

    this.logger.log(`Deleted proposal ${proposalId}`);
  }

  /**
   * Ping customer (send email) about a proposal
   */
  async pingCustomer(
    domainId: string,
    proposalId: string,
    requestingUser: AuthenticatedUser,
  ): Promise<void> {
    const proposal = await this.getProposal(domainId, proposalId);
    if (proposal.status === "draft") {
      throw new BadRequestException("Cannot ping customer for a draft proposal");
    }
    const customer = await this.usersService.findOne(domainId, proposal.userId);
    await this.emailService.sendProposalNotification?.(
      customer.email,
      proposal,
      "ping",
    );
    this.logger.log(
      `Pinged customer ${customer.email} for proposal ${proposalId}`,
    );
  }

  private async notifyProposalUpdate(
    proposal: Proposal,
    actor: AuthenticatedUser,
    action: "created" | "updated",
  ): Promise<void> {
    const recipients: string[] = [];
    const baseUrl = process.env.FRONTEND_URL ?? "";
    let portalPath = "/buying-proposal";

    if (actor.role === "customer") {
      if (proposal.dealerId) {
        try {
          const dealer = await this.usersService.findOne(
            proposal.domainId,
            proposal.dealerId,
          );
          if (dealer?.email) recipients.push(dealer.email);
        } catch (err) {
          this.logger.warn(
            `Failed to fetch dealer ${proposal.dealerId} for proposal ${proposal.id}`,
            err,
          );
        }
      }
      try {
        const domain = await this.domainsService.findOne(proposal.domainId);
        if (domain?.adminEmail) recipients.push(domain.adminEmail);
      } catch (err) {
        this.logger.warn(
          `Failed to fetch domain owner for proposal ${proposal.id}`,
          err,
        );
      }
      portalPath = `/sales?domainId=${encodeURIComponent(proposal.domainId)}&userId=${encodeURIComponent(proposal.userId)}`;
    } else {
      try {
        const customer = await this.usersService.findOne(
          proposal.domainId,
          proposal.userId,
        );
        if (customer?.email) recipients.push(customer.email);
      } catch (err) {
        this.logger.warn(
          `Failed to fetch customer ${proposal.userId} for proposal ${proposal.id}`,
          err,
        );
      }
    }

    if (recipients.length === 0) {
      this.logger.warn(
        `No recipients resolved for proposal ${proposal.id} ${action} notification`,
      );
      return;
    }

    try {
      await this.emailService.sendProposalDigest({
        recipients,
        proposal,
        action,
        actorEmail: actor.email,
        actorRole: actor.role,
        portalLink: `${baseUrl}${portalPath}`,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to send proposal ${action} digest for ${proposal.id}`,
        err,
      );
    }
  }
}

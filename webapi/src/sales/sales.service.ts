import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CosmosService, Proposal } from '@tastematcher/common';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.interface';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);
  private readonly cosmosService: CosmosService;

  constructor(
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
  ) {
    this.cosmosService = new CosmosService();
  }

  private async getContainer() {
    return this.cosmosService.getContainer('SalesProposals');
  }

  /**
   * Create proposal and notify customer
   */
  async createProposal(domainId: string, proposal: Partial<Proposal>, requestingUser: AuthenticatedUser): Promise<Proposal> {
    if (!proposal.userId) throw new BadRequestException('userId required');
    const container = await this.getContainer();

    // authorization handled in controller - service trusts caller but double-check domain
    const newProposal: Proposal = {
      id: uuidv4(),
      domainId,
      userId: proposal.userId!,
      dealerId: proposal.dealerId ?? requestingUser.id,
      items: proposal.items ?? [],
      metadata: proposal.metadata ?? {},
      generalComments: proposal.generalComments ?? [],
      status: (proposal as any).status ?? 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { resource } = await container.items.create(newProposal);
    // send email to customer (best-effort)
    try {
      const customer = await this.usersService.findOne(domainId, newProposal.userId);
      await this.emailService.sendProposalNotification?.(customer.email, newProposal, 'created');
    } catch (err) {
      this.logger.warn('Failed to send proposal notification', err);
    }

    this.logger.log(`Created proposal ${resource?.id} for user ${resource?.userId}`);
    return resource as Proposal;
  }

  /**
   * Get a proposal by id
   */
  async getProposal(domainId: string, proposalId: string): Promise<Proposal> {
    const container = await this.getContainer();
    try {
      const { resource } = await container.item(proposalId, domainId).read<Proposal>();
      if (!resource) throw new NotFoundException('Proposal not found');
      return resource;
    } catch (err) {
      this.logger.error(`Failed to read proposal ${proposalId}`, err);
      throw new NotFoundException('Proposal not found');
    }
  }

  /**
   * List proposals for a domain (optionally filtered by userId)
   */
  async findAll(domainId: string, userId?: string, dealerUserId?: string): Promise<Proposal[]> {
    const container = await this.getContainer();
    let questProperties;

    if (dealerUserId) {
      questProperties = {
        query: 'SELECT * FROM c WHERE c.domainId = @domainId AND c.dealerId = @dealerUserId ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@domainId', value: domainId },
          { name: '@dealerUserId', value: dealerUserId },
        ],
      };
    } else if (userId) {
      questProperties = {
        query: 'SELECT * FROM c WHERE c.domainId = @domainId AND c.userId = @userId ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@domainId', value: domainId },
          { name: '@userId', value: userId },
        ],
      };
    } else {
      questProperties = {
        query: 'SELECT * FROM c WHERE c.domainId = @domainId ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@domainId', value: domainId },
        ],
      };
    }

    const { resources } = await container.items.query<Proposal>(questProperties).fetchAll();
    return resources;
  }

  /**
   * Update proposal and notify customer
   */
  async updateProposal(domainId: string, proposalId: string, update: Partial<Proposal>, requestingUser: AuthenticatedUser): Promise<Proposal> {
    const container = await this.getContainer();
    const existing = await this.getProposal(domainId, proposalId);

    // Apply updates
    const updated: Proposal = {
      ...existing,
      items: update.items ?? existing.items,
      metadata: update.metadata ?? existing.metadata,
      generalComments: update.generalComments ?? existing.generalComments,
      dealerId: update.dealerId ?? existing.dealerId,
      status: (update as any).status ?? existing.status,
      updatedAt: Date.now(),
    };

    const { resource } = await container.item(proposalId, domainId).replace(updated as any);
    try {
      const customer = await this.usersService.findOne(domainId, resource.userId);
      await this.emailService.sendProposalNotification?.(customer.email, resource, 'updated');
    } catch (err) {
      this.logger.warn('Failed to send proposal update notification', err);
    }

    this.logger.log(`Updated proposal ${proposalId}`);
    return resource as Proposal;
  }

  /**
   * Delete proposal and notify customer
   */
  async removeProposal(domainId: string, proposalId: string, requestingUser: AuthenticatedUser): Promise<void> {
    const container = await this.getContainer();
    const existing = await this.getProposal(domainId, proposalId);

    await container.item(proposalId, domainId).delete();
    try {
      const customer = await this.usersService.findOne(domainId, existing.userId);
      await this.emailService.sendProposalNotification?.(customer.email, existing, 'deleted');
    } catch (err) {
      this.logger.warn('Failed to send proposal deletion notification', err);
    }

    this.logger.log(`Deleted proposal ${proposalId}`);
  }

  /**
   * Ping customer (send email) about a proposal
   */
  async pingCustomer(domainId: string, proposalId: string, requestingUser: AuthenticatedUser): Promise<void> {
    const proposal = await this.getProposal(domainId, proposalId);
    const customer = await this.usersService.findOne(domainId, proposal.userId);
    await this.emailService.sendProposalNotification?.(customer.email, proposal, 'ping');
    this.logger.log(`Pinged customer ${customer.email} for proposal ${proposalId}`);
  }
}

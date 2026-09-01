import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import {
  Artwork,
  AI_RECOMMENDATIONS_MIN_SWIPES,
  CosmosService,
  GeneratedProposalDraft,
  getAIRecommendationsEligibility,
  LikedStatus,
  Proposal,
  ProposalEngagement,
  ProposalGenerationEligibility,
  ProposalItem,
  ProposalSalesWorkflow,
  RecordProposalEngagementRequest,
  RecommendationScoreDetails,
} from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";
import { EmailService } from "../email/email.service";
import { UsersService } from "../users/users.service";
import { AuthenticatedUser } from "../auth/types/authenticated-request.interface";
import { DomainsService } from "../domains/domains.service";
import { DomainActivityService } from "../activity/domain-activity.service";
import { ProductActivityLoggerService } from "../activity/product-activity-logger.service";
import { ArtworksService } from "../artworks/artworks.service";

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);
  private readonly cosmosService: CosmosService;

  constructor(
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly domainsService: DomainsService,
    private readonly domainActivityService: DomainActivityService,
    private readonly artworksService: ArtworksService,
    private readonly productActivityLogger?: ProductActivityLoggerService,
  ) {
    this.cosmosService = new CosmosService();
  }

  private async getContainer() {
    return this.cosmosService.getContainer("Proposals");
  }

  /**
   * Report whether a customer has the required taste data and active-auction
   * recommendations for an AI-generated proposal.
   */
  async getAIDraftEligibility(
    domainId: string,
    userId: string,
    requestingUser: AuthenticatedUser,
  ): Promise<ProposalGenerationEligibility> {
    if (!userId) throw new BadRequestException("userId required");

    const customer = await this.usersService.findOne(domainId, userId);
    const swipeCount = customer.swipeCount ?? 0;
    const onboardingCompleted = customer.onboardingStatus === "completed";
    const preferenceVectorReady =
      Array.isArray(customer.preferenceVector) &&
      customer.preferenceVector.length === 1024 &&
      customer.preferenceVector.some((value) => value !== 0);
    const recommendationEligibility = getAIRecommendationsEligibility(customer);

    const reasons = [...recommendationEligibility.reasons];
    if (!preferenceVectorReady) {
      reasons.push(
        "The customer does not have a usable taste profile yet. More preference data is needed before AI matching can run.",
      );
    }

    if (reasons.length > 0) {
      return {
        userId,
        isEligible: false,
        reasons,
        onboardingCompleted,
        swipeCount,
        minimumSwipeCount: AI_RECOMMENDATIONS_MIN_SWIPES,
        preferenceVectorReady,
        activeAuctionRecommendationCount: 0,
      };
    }

    let recommendations: Artwork[];
    try {
      recommendations = await this.artworksService.getRecommendationsForUser(
        domainId,
        requestingUser,
        userId,
        32,
        0,
        true,
      );
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "AI recommendations are unavailable for this customer right now.";
      return {
        userId,
        isEligible: false,
        reasons: [message],
        onboardingCompleted,
        swipeCount,
        minimumSwipeCount: AI_RECOMMENDATIONS_MIN_SWIPES,
        preferenceVectorReady,
        activeAuctionRecommendationCount: 0,
      };
    }
    const activeAuctionRecommendationCount = recommendations.filter((artwork) =>
      this.isActiveAuction(artwork),
    ).length;

    if (activeAuctionRecommendationCount === 0) {
      reasons.push(
        "There are no active auction artworks that currently match this customer's taste profile.",
      );
    }

    return {
      userId,
      isEligible: reasons.length === 0,
      reasons,
      onboardingCompleted,
      swipeCount,
      minimumSwipeCount: AI_RECOMMENDATIONS_MIN_SWIPES,
      preferenceVectorReady,
      activeAuctionRecommendationCount,
    };
  }

  /**
   * Generate an editable AI proposal draft without saving or notifying.
   */
  async generateAIDraft(
    domainId: string,
    userId: string,
    requestingUser: AuthenticatedUser,
    limit = 8,
  ): Promise<GeneratedProposalDraft> {
    if (!userId) throw new BadRequestException("userId required");

    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 12)
      : 8;
    const recommendationLimit = Math.max(normalizedLimit * 4, 20);
    const recommendations =
      await this.artworksService.getRecommendationsForUser(
        domainId,
        requestingUser,
        userId,
        recommendationLimit,
        0,
        true,
      );

    const activeAuctionRecommendations = recommendations
      .filter((artwork) => this.isActiveAuction(artwork))
      .sort((left, right) => this.compareGeneratedDraftArtwork(left, right));

    const selectedArtworks = activeAuctionRecommendations.slice(
      0,
      normalizedLimit,
    );

    if (selectedArtworks.length === 0) {
      throw new BadRequestException(
        "No active auction recommendations are available for this customer.",
      );
    }

    const customer = await this.usersService.findOne(domainId, userId);
    const generatedAt = Date.now();
    const items = selectedArtworks.map((artwork) =>
      this.buildGeneratedProposalItem(artwork, requestingUser.email),
    );
    const topThemes = this.extractDraftThemes(selectedArtworks);

    return {
      userId,
      items,
      generalComments: [
        {
          author: requestingUser.email ?? "Specialist",
          text: this.buildGeneratedIntroNote(customer.name, selectedArtworks),
          createdAt: generatedAt,
        },
      ],
      metadata: {
        generatedBy: "ai",
        generatedAt,
        viewingRoom: {
          title: `Auction works selected for ${customer.name ?? customer.email ?? "you"}`,
          introNote: this.buildGeneratedIntroNote(
            customer.name,
            selectedArtworks,
          ),
          expiresAt: generatedAt + 14 * 24 * 60 * 60 * 1000,
          priceVisibility: "show",
        },
        aiGeneratedProposal: {
          source: "recommendations",
          selectionRule:
            "Active auction works from AI Suggestions, prioritizing customer-liked works and high match ranking.",
          artworkCount: selectedArtworks.length,
          themes: topThemes,
        },
        salesWorkflow: {
          stage: "ready_to_review",
          templateId: "auction_opportunity",
          priorityArtworkIds: selectedArtworks.map((artwork) => artwork.id),
        },
      },
      status: "draft",
    };
  }

  private isActiveAuction(artwork: Artwork): boolean {
    if (artwork.isAuction !== true) return false;
    if (!artwork.endDate) return true;
    return new Date(artwork.endDate).getTime() > Date.now();
  }

  private compareGeneratedDraftArtwork(left: Artwork, right: Artwork): number {
    const likedDelta =
      (right.likedStatus === LikedStatus.Liked ? 1 : 0) -
      (left.likedStatus === LikedStatus.Liked ? 1 : 0);
    if (likedDelta !== 0) return likedDelta;
    return (right.probabilityMatch ?? 0) - (left.probabilityMatch ?? 0);
  }

  private buildGeneratedProposalItem(
    artwork: Artwork,
    dealerEmail?: string,
  ): ProposalItem {
    return {
      artworkId: artwork.id,
      comments: [
        {
          author: dealerEmail ?? "Specialist",
          text: this.buildArtworkSelectionReason(artwork),
          createdAt: Date.now(),
        },
      ],
      status: "pending",
      askedPrice: artwork.price ?? 0,
      askedMaxPrice: artwork.maxPrice,
    };
  }

  private buildArtworkSelectionReason(artwork: Artwork): string {
    const reasons = this.getRecommendationReasons(artwork.recommendationScore);
    const match =
      typeof artwork.probabilityMatch === "number"
        ? `${Math.round(artwork.probabilityMatch * 100)}% match`
        : "strong match";
    const likedPrefix =
      artwork.likedStatus === LikedStatus.Liked
        ? "The customer already liked this auction work"
        : "AI selected this active auction work";
    const reasonText =
      reasons.length > 0 ? ` because ${reasons.join("; ")}.` : ".";
    return `${likedPrefix} with a ${match}${reasonText}`;
  }

  private getRecommendationReasons(
    score?: RecommendationScoreDetails,
  ): string[] {
    return (score?.reasons ?? [])
      .map((reason) => reason.trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  private buildGeneratedIntroNote(
    customerName: string | undefined,
    artworks: Artwork[],
  ): string {
    const name = customerName?.trim() || "you";
    const themes = this.extractDraftThemes(artworks);
    const themeText =
      themes.length > 0
        ? ` The selection leans into ${themes.join(", ")}.`
        : "";
    return `I prepared this AI-assisted auction proposal for ${name}, based on current recommendations, prior likes, and high-ranking match signals.${themeText}`;
  }

  private extractDraftThemes(artworks: Artwork[]): string[] {
    const counts = new Map<string, number>();
    artworks.forEach((artwork) => {
      [artwork.medium, ...(artwork.tags ?? [])]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 3)
      .map(([theme]) => theme);
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
    const proposalStatus = (proposal as Proposal).status ?? "draft";
    const newProposal: Proposal = {
      id: uuidv4(),
      type: "proposal",
      domainId,
      userId: proposal.userId!,
      dealerId: proposal.dealerId ?? requestingUser.id,
      items: proposal.items ?? [],
      metadata: this.applyWorkflowStatus(
        proposal.metadata ?? {},
        proposalStatus,
      ),
      generalComments: proposal.generalComments ?? [],
      status: proposalStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      submittedAt: proposalStatus === "submitted" ? Date.now() : undefined,
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
    return resource as unknown as Proposal;
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
          ...(includeDrafts ? [] : [{ name: "@draftStatus", value: "draft" }]),
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
    const nextStatus = (update as Proposal).status ?? existing.status;
    const updated: Proposal = {
      ...existing,
      type: "proposal",
      items: update.items ?? existing.items,
      metadata: this.applyWorkflowStatus(
        update.metadata ?? existing.metadata ?? {},
        nextStatus,
      ),
      generalComments: update.generalComments ?? existing.generalComments,
      dealerId: update.dealerId ?? existing.dealerId,
      status: nextStatus,
      updatedAt: Date.now(),
      submittedAt:
        nextStatus === "submitted"
          ? (existing.submittedAt ?? Date.now())
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

  private applyWorkflowStatus(
    metadata: Record<string, unknown>,
    status: Proposal["status"],
  ): Record<string, unknown> {
    const workflow = (metadata.salesWorkflow ??
      {}) as Partial<ProposalSalesWorkflow>;
    if (
      status !== "submitted" ||
      (workflow.stage && workflow.stage !== "drafting")
    ) {
      return metadata;
    }
    return {
      ...metadata,
      salesWorkflow: { ...workflow, stage: "sent" },
    };
  }

  /** Record a customer opening a proposal or intentionally opening an artwork. */
  async recordCustomerEngagement(
    domainId: string,
    proposalId: string,
    customer: AuthenticatedUser,
    event: RecordProposalEngagementRequest,
  ): Promise<Proposal> {
    if (event?.event !== "opened" && event?.event !== "artwork_viewed") {
      throw new BadRequestException("Unsupported engagement event.");
    }
    const proposal = await this.getProposal(domainId, proposalId);
    if (proposal.userId !== customer.id) {
      throw new ForbiddenException(
        "Customers can only record engagement on their own proposal.",
      );
    }
    if (proposal.status !== "submitted") {
      throw new BadRequestException(
        "Engagement can only be recorded for a submitted proposal.",
      );
    }
    if (event.event === "artwork_viewed") {
      if (!event.artworkId) {
        throw new BadRequestException("artworkId required for artwork_viewed");
      }
      if (!proposal.items.some((item) => item.artworkId === event.artworkId)) {
        throw new BadRequestException("Artwork is not part of this proposal.");
      }
    }

    const now = Date.now();
    const metadata = proposal.metadata ?? {};
    const currentEngagement = (metadata.engagement ??
      {}) as Partial<ProposalEngagement>;
    const viewedArtworkIds = new Set(currentEngagement.viewedArtworkIds ?? []);
    if (event.event === "artwork_viewed" && event.artworkId) {
      viewedArtworkIds.add(event.artworkId);
    }
    const currentWorkflow = (metadata.salesWorkflow ??
      {}) as Partial<ProposalSalesWorkflow>;
    const salesWorkflow: ProposalSalesWorkflow = {
      ...currentWorkflow,
      stage:
        currentWorkflow.stage === "sent"
          ? "viewed"
          : (currentWorkflow.stage ?? "viewed"),
      lastCustomerActivityAt: now,
    };
    const engagement: ProposalEngagement = {
      viewCount:
        (currentEngagement.viewCount ?? 0) + (event.event === "opened" ? 1 : 0),
      firstViewedAt: currentEngagement.firstViewedAt ?? now,
      lastViewedAt: now,
      viewedArtworkIds: [...viewedArtworkIds],
      lastCustomerActivityAt: now,
    };
    const updated: Proposal = {
      ...proposal,
      metadata: { ...metadata, salesWorkflow, engagement },
      updatedAt: now,
    };
    const container = await this.getContainer();
    const { resource } = await container
      .item(proposalId, domainId)
      .replace(updated as never);
    await this.domainActivityService.recordActivity({
      domainId,
      activityType: "proposal_updated",
      userId: customer.id,
      userEmail: customer.email,
      metadata: { proposalId, engagementEvent: event.event },
    });
    return resource as unknown as Proposal;
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
      throw new BadRequestException(
        "Cannot ping customer for a draft proposal",
      );
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

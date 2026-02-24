import { Injectable, Logger } from "@nestjs/common";
import {
  CosmosService,
  DomainActivityEvent,
  DomainActivitySummaryResponse,
  DomainActivityType,
  User,
} from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";

const DOMAIN_ACTIVITY_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class DomainActivityService {
  private readonly logger = new Logger(DomainActivityService.name);
  private readonly cosmosService: CosmosService;

  constructor() {
    this.cosmosService = new CosmosService();
  }

  async recordActivity(params: {
    domainId: string;
    activityType: DomainActivityType;
    userId: string;
    userEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const container = await this.cosmosService.getContainer("Proposals");
      const event: DomainActivityEvent = {
        id: uuidv4(),
        type: "domainActivity",
        domainId: params.domainId,
        ttl: DOMAIN_ACTIVITY_TTL_SECONDS,
        activityType: params.activityType,
        userId: params.userId,
        userEmail: params.userEmail,
        createdAt: Date.now(),
        metadata: params.metadata,
      };
      await container.items.create(event);
    } catch (err) {
      this.logger.warn("Failed to record domain activity event", err as Error);
    }
  }

  async getSummary(
    domainId: string,
    days: number = 7,
  ): Promise<DomainActivitySummaryResponse> {
    const until = Date.now();
    const safeDays = Number.isFinite(days)
      ? Math.max(1, Math.min(30, Math.floor(days)))
      : 7;
    const since = until - safeDays * 24 * 60 * 60 * 1000;

    const eventsContainer = await this.cosmosService.getContainer("Proposals");
    const usersContainer = await this.cosmosService.getContainer("Core");

    const eventsQuery = {
      query:
        "SELECT c.userId, c.userEmail, c.activityType, c.createdAt FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.createdAt >= @since ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@type", value: "domainActivity" },
        { name: "@domainId", value: domainId },
        { name: "@since", value: since },
      ],
    };

    const usersQuery = {
      query:
        "SELECT c.id, c.name, c.email FROM c WHERE c.type = @type AND c.domainId = @domainId",
      parameters: [
        { name: "@type", value: "user" },
        { name: "@domainId", value: domainId },
      ],
    };

    const [{ resources: events }, { resources: users }] = await Promise.all([
      eventsContainer.items
        .query<
          Pick<
            DomainActivityEvent,
            "userId" | "userEmail" | "activityType" | "createdAt"
          >
        >(eventsQuery)
        .fetchAll(),
      usersContainer.items
        .query<Pick<User, "id" | "name" | "email">>(usersQuery)
        .fetchAll(),
    ]);

    const usersById = new Map<string, { name?: string; email?: string }>(
      users.map((u) => [u.id, { name: u.name, email: u.email }]),
    );

    const rowsByUser = new Map<
      string,
      {
        userId: string;
        userName?: string;
        userEmail?: string;
        loginTimestamps: number[];
        swipes: number;
        proposalUpdates: number;
        likes: number;
        dislikes: number;
        artworkComments: number;
        lastActivityAt: number;
      }
    >();

    let loginEvents = 0;
    let swipes = 0;
    let proposalUpdates = 0;
    let likes = 0;
    let dislikes = 0;
    let artworkComments = 0;

    for (const event of events) {
      const existing = rowsByUser.get(event.userId) ?? {
        userId: event.userId,
        userName: usersById.get(event.userId)?.name,
        userEmail: event.userEmail ?? usersById.get(event.userId)?.email,
        loginTimestamps: [],
        swipes: 0,
        proposalUpdates: 0,
        likes: 0,
        dislikes: 0,
        artworkComments: 0,
        lastActivityAt: 0,
      };

      if (event.activityType === "user_login") {
        existing.loginTimestamps.push(event.createdAt);
        loginEvents += 1;
      } else if (event.activityType === "user_swipe") {
        existing.swipes += 1;
        swipes += 1;
      } else if (event.activityType === "proposal_updated") {
        existing.proposalUpdates += 1;
        proposalUpdates += 1;
      } else if (event.activityType === "artwork_liked") {
        existing.likes += 1;
        likes += 1;
      } else if (event.activityType === "artwork_disliked") {
        existing.dislikes += 1;
        dislikes += 1;
      } else if (event.activityType === "artwork_comment") {
        existing.artworkComments += 1;
        artworkComments += 1;
      }

      existing.lastActivityAt = Math.max(
        existing.lastActivityAt,
        event.createdAt,
      );
      rowsByUser.set(event.userId, existing);
    }

    const rows = Array.from(rowsByUser.values())
      .map((row) => ({
        ...row,
        loginTimestamps: row.loginTimestamps.sort((a, b) => b - a),
      }))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    return {
      since,
      until,
      rows,
      totals: {
        loginEvents,
        swipes,
        proposalUpdates,
        likes,
        dislikes,
        artworkComments,
      },
    };
  }
}

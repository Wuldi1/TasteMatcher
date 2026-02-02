import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Artwork,
  ArtworkFeedback,
  ArtworkPreference,
  ArtworkStats,
  CosmosService,
  executeCosmosQuery,
  generatePreferenceId,
  getAIRecommendationsEligibility,
  GlobalArtworksDomainId,
  isAuctionEnded,
  LikedStatus,
  PaginatedResponse,
  Proposal,
  QueryParams,
  Role,
  SearchIndexService,
  UntastedArtworksResponse,
} from "@tastematcher/common";
import { SavePreferenceDto } from "./dto/save-preference.dto";
import { UpdateArtworkDto } from "./dto/update-artwork.dto";

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);
  private readonly cosmosService: CosmosService;
  private readonly searchIndexService: SearchIndexService;
  private readonly userCache = new Map<
    string,
    { name?: string; email?: string; cachedAt: number }
  >();
  private readonly userCacheTtlMs = 10 * 60 * 1000;

  constructor() {
    this.cosmosService = new CosmosService();
    this.searchIndexService = new SearchIndexService();
  }

  /**
   * Fetch artworks with generic query parameters using CosmosQueryBuilder
   * If requestedUserId is provided (customer), attach likedStatus per artwork by joining user's preferences.
   */
  async findAll(
    domainId: string,
    queryParams: QueryParams<Artwork>,
    requestedUserId?: string,
    viewer?: { id: string; role: Role; invitedBy?: string | null },
    hideEndedAuctions: boolean = false,
  ): Promise<PaginatedResponse<Artwork>> {
    const container = await this.cosmosService.getArtworksContainer();
    const normalizedQueryParams: QueryParams<Artwork> = {
      ...queryParams,
      filters: [
        ...(queryParams.filters ?? []),
        { field: "type", operator: "eq", value: "artwork" },
      ],
    };

    try {
      const result = await executeCosmosQuery<Artwork>(
        container,
        "domainId",
        domainId,
        normalizedQueryParams,
        { field: "createdAt", order: "desc" },
      );

      this.logger.log(
        `Fetched ${result.items.length} artworks for domain ${domainId}`,
      );

      // If requestedUserId provided, fetch that user's preferences and map them
      if (requestedUserId) {
        try {
          const preferencesContainer =
            await this.cosmosService.getArtworkPreferencesContainer();

          // Query preferences for this user (stored in Artworks container, partitioned by domainId)
          const prefQuery = {
            query:
              "SELECT c.artworkId, c.liked, c.comment FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId",
            parameters: [
              { name: "@type", value: "artworkPreference" },
              { name: "@domainId", value: domainId },
              { name: "@userId", value: requestedUserId },
            ],
          };

          const { resources: prefs } = await preferencesContainer.items
            .query(prefQuery, { partitionKey: domainId })
            .fetchAll();

          const prefMap = new Map<
            string,
            { liked?: boolean; comment?: string }
          >();
          for (const p of prefs) {
            if (p && p.artworkId) {
              prefMap.set(p.artworkId, {
                liked: typeof p.liked === "boolean" ? p.liked : undefined,
                comment: p.comment,
              });
            }
          }

          // Attach likedStatus/comment to each artwork
          result.items = result.items.map((art) => {
            const pref = prefMap.get(art.id);
            const liked = pref?.liked;

            const artAny = art as Artwork;
            if (liked === undefined) {
              artAny.likedStatus = LikedStatus.NotTasted;
            } else if (liked === true) {
              artAny.likedStatus = LikedStatus.Liked;
            } else {
              artAny.likedStatus = LikedStatus.Disliked;
            }
            artAny.preferenceComment = pref?.comment;
            return artAny as Artwork;
          });
        } catch (prefErr) {
          this.logger.warn(
            `Failed to enrich artworks with user preferences for user ${requestedUserId}`,
            prefErr,
          );
          // continue without likedStatus
        }
      }

      const filteredItems = (result.items || []).filter((art) => {
        if (!this.canViewerSeeArtwork(art, viewer)) return false;
        if (
          hideEndedAuctions &&
          art.isAuction === true &&
          isAuctionEnded(art)
        ) {
          return false;
        }
        return true;
      });

      return {
        items: filteredItems,
        continuationToken: result.continuationToken,
        hasMore: result.hasMore,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch artworks for domain ${domainId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch artworks filtered by a user's like/dislike preference with pagination.
   */
  async findByPreference(
    domainId: string,
    userId: string,
    liked: boolean,
    queryParams: QueryParams<Artwork>,
    viewer?: { id: string; role: Role; invitedBy?: string | null },
    hideEndedAuctions: boolean = false,
  ): Promise<PaginatedResponse<Artwork>> {
    const preferencesContainer =
      await this.cosmosService.getArtworkPreferencesContainer();
    const artworksContainer = await this.cosmosService.getArtworksContainer();

    const limit = queryParams.limit ?? 20;

    const prefQuery = {
      query: `
        SELECT c.artworkId, c.comment, c.createdAt
        FROM c
        WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId AND c.liked = @liked
        ORDER BY c.createdAt DESC
      `,
      parameters: [
        { name: "@type", value: "artworkPreference" },
        { name: "@domainId", value: domainId },
        { name: "@userId", value: userId },
        { name: "@liked", value: liked },
      ],
    };

    const prefResponse = await preferencesContainer.items
      .query(prefQuery, {
        partitionKey: domainId,
        maxItemCount: limit,
        continuationToken: queryParams.continuationToken,
      })
      .fetchNext();

    const preferences = prefResponse.resources ?? [];
    const preferenceContinuation = prefResponse.continuationToken ?? null;

    const artworkIds = preferences
      .map((pref) => pref.artworkId)
      .filter(Boolean);
    if (artworkIds.length === 0) {
      return {
        items: [],
        continuationToken: preferenceContinuation,
        hasMore: Boolean(preferenceContinuation),
      };
    }

    const ordered: Artwork[] = [];
    for (const preference of preferences) {
      if (!preference?.artworkId) {
        continue;
      }
      const { artworkId } = preference;
      const { resource: art } = await artworksContainer
        .item(artworkId, domainId)
        .read<Artwork>();
      if (!art) continue;
      const enriched = art as Artwork;
      enriched.likedStatus = liked ? LikedStatus.Liked : LikedStatus.Disliked;
      if (preference.comment) {
        enriched.preferenceComment = preference.comment;
      } else {
        delete enriched.preferenceComment;
      }
      if (
        this.canViewerSeeArtwork(enriched, viewer) &&
        (!hideEndedAuctions ||
          enriched.isAuction !== true ||
          !isAuctionEnded(enriched))
      ) {
        ordered.push(enriched);
      }
    }

    return {
      items: ordered,
      continuationToken: preferenceContinuation,
      hasMore: Boolean(preferenceContinuation),
    };
  }

  /**
   * Get single artwork by ID
   */
  async findOne(domainId: string, artworkId: string): Promise<Artwork> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      const { resource } = await container.item(artworkId, domainId).read();

      if (!resource) {
        throw new NotFoundException(`Artwork ${artworkId} not found`);
      }

      return resource;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch artwork ${artworkId}`, error);
      throw new NotFoundException(`Artwork ${artworkId} not found`);
    }
  }

  /**
   * Update artwork metadata
   */
  async update(
    domainId: string,
    artworkId: string,
    updateDto: UpdateArtworkDto,
    user?: { id: string; role?: Role },
  ): Promise<Artwork> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      const { resource: existing } = await container
        .item(artworkId, domainId)
        .read();

      if (!existing) {
        throw new NotFoundException(`Artwork ${artworkId} not found`);
      }

      const privacyChangeRequested = Object.prototype.hasOwnProperty.call(
        updateDto,
        "isPrivate",
      );
      if (
        privacyChangeRequested &&
        updateDto.isPrivate !== existing.isPrivate
      ) {
        if (!user?.id) {
          throw new ForbiddenException(
            "Only the uploader can change artwork privacy.",
          );
        }
        if (!existing.uploadedBy || existing.uploadedBy !== user.id) {
          throw new ForbiddenException(
            "You can only change privacy on artworks you uploaded.",
          );
        }
      }

      const updated = {
        ...existing,
        ...updateDto,
        updatedAt: Date.now(),
      };

      const { resource } = await container
        .item(artworkId, domainId)
        .replace(updated);

      this.logger.log(`Updated artwork ${artworkId} in domain ${domainId}`);

      return resource;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update artwork ${artworkId}`, error);
      throw error;
    }
  }

  /**
   * Delete artwork
   */
  async remove(domainId: string, artworkId: string): Promise<void> {
    const container = await this.cosmosService.getArtworksContainer();

    try {
      await container.item(artworkId, domainId).delete();
      this.logger.log(`Deleted artwork ${artworkId} from domain ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to delete artwork ${artworkId}`, error);
      throw new NotFoundException(`Artwork ${artworkId} not found`);
    }

    try {
      await this.searchIndexService.deleteArtworkDocument(artworkId);
    } catch (error) {
      this.logger.error(
        `Failed to delete artwork ${artworkId} from search index`,
        error,
      );
      throw new InternalServerErrorException(
        "Artwork deleted but failed to remove from search index.",
      );
    }
  }

  /**
   * Get aggregated statistics for artworks in a domain
   * Includes total likes, dislikes, swipes, and recently added artworks.
   */
  async getStats(domainId: string, userId: string): Promise<ArtworkStats> {
    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const usersContainer = await this.cosmosService.getContainer("Core");

    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const totalQuery = {
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.type = @type",
        parameters: [
          { name: "@domainId", value: domainId },
          { name: "@type", value: "artwork" },
        ],
      };

      const recentQuery = {
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.domainId = @domainId AND c.type = @type AND c.createdAt >= @sevenDaysAgo",
        parameters: [
          { name: "@domainId", value: domainId },
          { name: "@type", value: "artwork" },
          { name: "@sevenDaysAgo", value: sevenDaysAgo },
        ],
      };

      const [totalResult, recentResult, userResult] = await Promise.all([
        artworksContainer.items.query(totalQuery).fetchAll(),
        artworksContainer.items.query(recentQuery).fetchAll(),
        usersContainer.item(userId, domainId).read(),
      ]);

      if (!userResult.resource) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      const stats: ArtworkStats = {
        totalArtworks: totalResult.resources[0] || 0,
        totalLikes:
          typeof userResult.resource.totalLikes === "number"
            ? userResult.resource.totalLikes
            : 0,
        totalDislikes:
          typeof userResult.resource.totalDislikes === "number"
            ? userResult.resource.totalDislikes
            : 0,
        totalSwiped:
          typeof userResult.resource.swipeCount === "number"
            ? userResult.resource.swipeCount
            : 0,
        recentlyAdded: recentResult.resources[0] || 0,
      };

      this.logger.log(`Retrieved stats for domain ${domainId}`, stats);

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get stats for domain ${domainId}`, error);
      throw error;
    }
  }

  /**
   * Get artworks that user hasn't tasted yet
   * Uses efficient anti-join pattern with Cosmos DB
   */
  async getUntastedArtworks(
    primaryDomainId: string,
    userId: string,
    limit: number = 20,
    includeDomainId?: string,
    viewer?: { id: string; role: Role; invitedBy?: string | null },
  ): Promise<UntastedArtworksResponse> {
    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const preferencesContainer =
      await this.cosmosService.getArtworkPreferencesContainer();

    try {
      // Step 1: Get all artwork IDs the user has already tasted
      const tastedQuery = {
        query:
          "SELECT VALUE c.artworkId FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId",
        parameters: [
          { name: "@type", value: "artworkPreference" },
          { name: "@domainId", value: GlobalArtworksDomainId },
          { name: "@userId", value: userId },
        ],
      };

      const { resources: tastedArtworkIds } = await preferencesContainer.items
        .query(tastedQuery, { partitionKey: GlobalArtworksDomainId })
        .fetchAll();

      this.logger.log(
        `User ${userId} has tasted ${tastedArtworkIds.length} artworks`,
      );

      // Step 2: Query artworks NOT in the tasted list
      let artworksQuery: string;
      const fetchLimit = Math.min(Math.max(limit * 3, limit), 200);
      const parameters: Array<{ name: string; value: any }> = [
        { name: "@primaryDomainId", value: primaryDomainId },
        { name: "@fetchLimit", value: fetchLimit },
      ];
      const secondaryDomainId =
        includeDomainId && includeDomainId !== primaryDomainId
          ? includeDomainId
          : undefined;
      if (secondaryDomainId) {
        parameters.push({
          name: "@secondaryDomainId",
          value: secondaryDomainId,
        });
      }

      const domainFilterClause = secondaryDomainId
        ? "(c.domainId = @primaryDomainId OR (c.domainId = @secondaryDomainId AND c.useForTaster = true))"
        : "c.domainId = @primaryDomainId";
      const typeClause = "c.type = @artworkType";
      const orderByCandidates = ["id", "price", "updatedAt", "_etag"] as const;
      const orderByField =
        orderByCandidates[Math.floor(Math.random() * orderByCandidates.length)];
      const orderByDirection = Math.random() < 0.5 ? "ASC" : "DESC";
      const orderByClause =
        orderByField === "_etag"
          ? `ORDER BY c._etag ${orderByDirection}`
          : `ORDER BY c.${orderByField} ${orderByDirection}`;

      if (tastedArtworkIds.length === 0) {
        // User hasn't tasted anything yet - return first N artworks
        artworksQuery = `
          SELECT TOP @fetchLimit * 
          FROM c 
          WHERE ${typeClause} AND ${domainFilterClause}
          ${orderByClause}
        `;
      } else {
        // Exclude already tasted artworks using NOT IN
        // Note: For large lists, consider pagination or alternative patterns
        artworksQuery = `
          SELECT TOP @fetchLimit * 
          FROM c 
          WHERE ${typeClause} AND ${domainFilterClause}
            AND NOT ARRAY_CONTAINS(@tastedIds, c.id)
          ${orderByClause}
        `;
        parameters.push({ name: "@tastedIds", value: tastedArtworkIds });
      }

      parameters.push({ name: "@artworkType", value: "artwork" });

      const { resources: untastedArtworks } = await artworksContainer.items
        .query({ query: artworksQuery, parameters })
        .fetchAll();

      this.logger.log(
        `Found ${untastedArtworks.length} untasted artworks for user ${userId} in domains ${primaryDomainId}${
          secondaryDomainId ? ` and ${secondaryDomainId}` : ""
        }`,
      );

      const limited = untastedArtworks.slice(0, limit);

      return {
        artworks: limited,
        total: limited.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get untasted artworks for user ${userId} in domains ${primaryDomainId}${includeDomainId ? ` and ${includeDomainId}` : ""}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Save or update artwork preference (like/dislike) for a user
   */
  async savePreference(
    domainId: string,
    userId: string,
    artworkId: string,
    saveDto: SavePreferenceDto,
  ): Promise<ArtworkPreference> {
    const artworkPreferencesContainer =
      await this.cosmosService.getArtworkPreferencesContainer();

    try {
      const preferenceId = generatePreferenceId(userId, artworkId);
      let updatedResource;
      const incomingLiked =
        typeof saveDto.liked === "boolean" ? saveDto.liked : undefined;

      // Check if preference already exists
      const { resource: existingPreference } = await artworkPreferencesContainer
        .item(preferenceId, domainId)
        .read();

      if (existingPreference) {
        // Update existing preference
        const updatedPreference = {
          ...existingPreference,
          ...saveDto,
          type: existingPreference.type ?? "artworkPreference",
          domainId,
          liked:
            typeof saveDto.liked === "boolean"
              ? saveDto.liked
              : existingPreference.liked,
          updatedAt: Date.now(),
        };

        const { resource: replacement } = await artworkPreferencesContainer
          .item(preferenceId, domainId)
          .replace(updatedPreference);
        updatedResource = replacement;
        this.logger.log(
          `Updated preference for artwork ${artworkId} by user ${userId}`,
        );
      } else {
        // Create new preference
        const newPreference = {
          id: preferenceId,
          type: "artworkPreference" as const,
          userId,
          ...saveDto,
          liked: typeof saveDto.liked === "boolean" ? saveDto.liked : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const { resource: created } =
          await artworkPreferencesContainer.items.create(newPreference);
        updatedResource = created;

        this.logger.log(
          `Saved new preference for artwork ${artworkId} by user ${userId}`,
        );
      }

      // first, get the user preferenceVector from his existing record
      const usersContainer = await this.cosmosService.getContainer("Core");
      let { resource: userRecord } = await usersContainer
        .item(userId, domainId)
        .read();
      if (!userRecord && domainId === GlobalArtworksDomainId) {
        const { resources } = await usersContainer.items
          .query({
            query: "SELECT * FROM c WHERE c.id = @userId AND c.type = 'user'",
            parameters: [{ name: "@userId", value: userId }],
          })
          .fetchAll();
        userRecord = resources[0];
      }
      if (!userRecord) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      const userPartitionKey = userRecord.domainId ?? domainId;
      const userPreferenceVector = userRecord.preferenceVector;
      const existingLiked =
        typeof existingPreference?.liked === "boolean"
          ? existingPreference.liked
          : undefined;

      const artworkResource = await this.findOne(saveDto.domainId, artworkId);
      if (!artworkResource) {
        throw new NotFoundException(
          `Artwork ${artworkId} not found for updating preference vector`,
        );
      }

      const imageVector = artworkResource.vector;
      const swipeCountBefore =
        typeof userRecord.swipeCount === "number" ? userRecord.swipeCount : 0;
      const totalLikes =
        typeof userRecord.totalLikes === "number" ? userRecord.totalLikes : 0;
      const totalDislikes =
        typeof userRecord.totalDislikes === "number"
          ? userRecord.totalDislikes
          : 0;
      let userRecordUpdated = false;

      const isNewSwipe =
        typeof incomingLiked === "boolean" &&
        typeof existingLiked !== "boolean";
      const likedChanged =
        typeof incomingLiked === "boolean" &&
        typeof existingLiked === "boolean" &&
        existingLiked !== incomingLiked;

      if (isNewSwipe) {
        userRecord.swipeCount = swipeCountBefore + 1;
        userRecord.totalLikes = totalLikes + (incomingLiked === true ? 1 : 0);
        userRecord.totalDislikes =
          totalDislikes + (incomingLiked === false ? 1 : 0);
        userRecordUpdated = true;
      } else if (likedChanged) {
        let likeDelta = 0;
        let dislikeDelta = 0;
        if (existingLiked === true) {
          likeDelta -= 1;
        }
        if (existingLiked === false) {
          dislikeDelta -= 1;
        }
        if (incomingLiked === true) {
          likeDelta += 1;
        }
        if (incomingLiked === false) {
          dislikeDelta += 1;
        }
        userRecord.totalLikes = Math.max(0, totalLikes + likeDelta);
        userRecord.totalDislikes = Math.max(0, totalDislikes + dislikeDelta);
        userRecordUpdated = true;
      }

      // if preferenceVector exists and is valid, update it using the new preference
      if (
        typeof incomingLiked === "boolean" &&
        (isNewSwipe || likedChanged) &&
        Array.isArray(userPreferenceVector) &&
        userPreferenceVector.length === 1024 &&
        imageVector &&
        imageVector.length === 1024
      ) {
        // Here you would implement the logic to update the user's preference vector
        // based on the new preference. This could involve calling an external service
        // or running a local algorithm to adjust the vector.
        const baseLearningRate = 0.2;
        const effectiveLearningRate =
          baseLearningRate / Math.sqrt(1 + swipeCountBefore);
        const updatedPreferenceVector =
          this.searchIndexService.calculateUpdatedPreferenceVector(
            userPreferenceVector,
            imageVector,
            incomingLiked,
            { learningRate: effectiveLearningRate, dislikeWeight: 0.6 },
          );

        // store updated preference vector back to user record
        userRecord.preferenceVector = updatedPreferenceVector;
        userRecordUpdated = true;
      }

      if (userRecordUpdated) {
        userRecord.updatedAt = Date.now();
        await usersContainer.item(userId, userPartitionKey).replace(userRecord);
        this.logger.log(
          `Updated user ${userId} after saving preference for artwork ${artworkId}`,
        );
      }

      return updatedResource!;
    } catch (error) {
      this.logger.error(
        `Failed to save preference for artwork ${artworkId} by user ${userId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get recommendations for a user (customer or domain owner scoped)
   */
  async getRecommendationsForUser(
    domainId: string,
    requester: { id: string; role: string },
    targetUserId?: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Array<Artwork>> {
    const resolvedUserId =
      (requester.role === "dealer" ||
        requester.role === "domain_owner" ||
        requester.role === "global_admin") &&
      targetUserId
        ? targetUserId
        : requester.id;

    // Fetch more candidates to account for filtering
    const fetchCount = (offset + limit) * 3;
    const start = Date.now();
    this.logger.debug({
      msg: "Fetching AI suggestions",
      domainId,
      requesterId: requester.id,
      targetUserId: resolvedUserId,
      limit,
      offset,
    });

    try {
      const userRecord = await this.cosmosService.getUser(
        domainId,
        resolvedUserId,
      );

      const { totalSwiped } = await this.getStats(domainId, resolvedUserId);
      userRecord.swipeCount = totalSwiped;

      const { isEligible, reasons } =
        getAIRecommendationsEligibility(userRecord);

      if (!isEligible) {
        this.logger.log({
          msg: `User not eligible for AI suggestions: ${reasons.join(", ")}`,
          domainId,
          targetUserId: resolvedUserId,
          durationMs: Date.now() - start,
        });

        throw new BadRequestException(
          `User not eligible for AI suggestions: ${reasons.join(", ")}`,
        );
      }

      const preferenceVector = Array.isArray(userRecord.preferenceVector)
        ? userRecord.preferenceVector
        : undefined;

      if (!preferenceVector || preferenceVector.length !== 1024) {
        this.logger.warn({
          msg: "Missing or invalid preference vector; skipping AI suggestions",
          domainId,
          targetUserId: resolvedUserId,
        });

        return [];
      }

      this.logger.debug({
        msg: "Generating AI suggestions using preference vector",
        domainId,
        targetUserId: resolvedUserId,
        preferenceVector: preferenceVector,
      });

      const matches = await this.searchIndexService.searchSimilarArtworks(
        domainId,
        preferenceVector,
        fetchCount,
      );

      this.logger.log({
        msg: "Number of matches",
        targetUserId: resolvedUserId,
        domainId,
        matchesCount: matches.length,
      });

      const artworksContainer = await this.cosmosService.getArtworksContainer();
      const preferencesContainer =
        await this.cosmosService.getArtworkPreferencesContainer();
      const recommendedArtworks: Artwork[] = [];

      // Fetch preferences for the user
      const preferencesQuery = {
        query:
          "SELECT c.artworkId, c.liked, c.comment FROM c WHERE c.type = @type AND c.domainId = @domainId AND c.userId = @userId",
        parameters: [
          { name: "@type", value: "artworkPreference" },
          { name: "@domainId", value: domainId },
          { name: "@userId", value: resolvedUserId },
        ],
      };

      const { resources: preferences } = await preferencesContainer.items
        .query(preferencesQuery, { partitionKey: domainId })
        .fetchAll();

      this.logger.log({
        msg: "Number of preferences",
        targetUserId: resolvedUserId,
        domainId,
        preferencesCount: preferences.length,
      });

      const preferencesMap = new Map<
        string,
        { liked?: boolean; comment?: string }
      >();
      preferences.forEach((pref) => {
        preferencesMap.set(pref.artworkId, {
          liked: typeof pref.liked === "boolean" ? pref.liked : undefined,
          comment: pref.comment,
        });
      });

      for (const match of matches) {
        const prefEntry = preferencesMap.get(match.artworkId);
        const liked = prefEntry?.liked;
        const comment = prefEntry?.comment;
        let shouldInclude = true;

        if (requester.role === "customer") {
          // Customer: filter out all artworks with either liked status (liked and disliked)
          if (typeof liked === "boolean") {
            shouldInclude = false;
          }
        } else {
          // Others: retrieve all artworks except disliked
          if (liked === false) {
            shouldInclude = false;
          }
        }

        if (!shouldInclude) {
          continue;
        }

        try {
          const { resource: artwork } = await artworksContainer
            .item(match.artworkId, domainId)
            .read();

          if (artwork) {
            artwork.probabilityMatch = match.score;

            // Attach liked status/comment to the artwork
            if (liked === undefined) {
              artwork.likedStatus = LikedStatus.NotTasted;
            } else if (liked) {
              artwork.likedStatus = LikedStatus.Liked;
            } else {
              artwork.likedStatus = LikedStatus.Disliked;
            }
            if (comment) {
              artwork.preferenceComment = comment;
            } else {
              delete artwork.preferenceComment;
            }

            recommendedArtworks.push(artwork);
          }
        } catch (lookupError) {
          this.logger.warn({
            msg: "Failed to fetch artwork during AI suggestions",
            domainId,
            artworkId: match.artworkId,
            error: (lookupError as Error).message,
          });
        }
      }

      this.logger.log({
        msg: "AI suggestions generated successfully",
        domainId,
        targetUserId: resolvedUserId,
        recommendationCount: recommendedArtworks.length,
        durationMs: Date.now() - start,
      });

      const visibleRecommendations = recommendedArtworks.filter((art) =>
        this.canViewerSeeArtwork(art, requester),
      );

      // Apply pagination
      return visibleRecommendations.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error({
        msg: "Failed to generate AI suggestions",
        domainId,
        requesterId: requester.id,
        targetUserId: resolvedUserId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Get aggregated feedback for a specific artwork (preferences, comments, proposals).
   */
  async getArtworkFeedback(
    domainId: string,
    artworkId: string,
  ): Promise<ArtworkFeedback> {
    const preferencesContainer =
      await this.cosmosService.getArtworkPreferencesContainer();
    const proposalsContainer =
      await this.cosmosService.getContainer("Proposals");

    const prefQuery = {
      query: `
        SELECT c.userId, c.liked, c.comment, c.createdAt, c.updatedAt
        FROM c
        WHERE c.type = @type AND c.domainId = @domainId AND c.artworkId = @artworkId
      `,
      parameters: [
        { name: "@type", value: "artworkPreference" },
        { name: "@domainId", value: domainId },
        { name: "@artworkId", value: artworkId },
      ],
    };

    const proposalsQuery = {
      query: `
        SELECT *
        FROM c
        WHERE c.type = @type AND c.domainId = @domainId
          AND c.status != @rejected
          AND ARRAY_CONTAINS(c.items, {"artworkId": @artworkId}, true)
      `,
      parameters: [
        { name: "@type", value: "proposal" },
        { name: "@domainId", value: domainId },
        { name: "@rejected", value: "rejected" },
        { name: "@artworkId", value: artworkId },
      ],
    };

    const [prefResult, proposalsResult] = await Promise.all([
      preferencesContainer.items
        .query(prefQuery, { partitionKey: domainId })
        .fetchAll(),
      proposalsContainer.items
        .query(proposalsQuery, { partitionKey: domainId })
        .fetchAll(),
    ]);

    const preferences = prefResult.resources ?? [];
    const proposals = (proposalsResult.resources ?? []) as Proposal[];

    const userIds = new Set<string>();
    preferences.forEach((p) => {
      if (p?.userId) userIds.add(p.userId);
    });
    proposals.forEach((p) => {
      if (p?.userId) userIds.add(p.userId);
      if (p?.dealerId) userIds.add(p.dealerId);
    });

    const userMap = await this.getUserSummaries(domainId, userIds);

    const preferenceItems = preferences.map((p) => ({
      id: p.id,
      userId: p.userId,
      userName: userMap.get(p.userId)?.name,
      userEmail: userMap.get(p.userId)?.email,
      liked: typeof p.liked === "boolean" ? p.liked : undefined,
      comment: p.comment,
      domainId: p.domainId,
      artworkId: p.artworkId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const likes = preferenceItems.filter((p) => p.liked === true).length;
    const dislikes = preferenceItems.filter((p) => p.liked === false).length;

    const commentItems = preferenceItems
      .filter(
        (p) => typeof p.comment === "string" && p.comment.trim().length > 0,
      )
      .map((p) => ({
        userId: p.userId,
        userName: p.userName,
        userEmail: p.userEmail,
        comment: {
          author: p.userName || p.userEmail || p.userId,
          text: p.comment!.trim(),
          createdAt: p.updatedAt ?? p.createdAt,
        },
        createdAt: p.updatedAt ?? p.createdAt,
      }));

    const commentUsers = new Set(commentItems.map((c) => c.userId));

    const proposalItems = [];
    for (const proposal of proposals) {
      const matchingItems = (proposal.items ?? []).filter(
        (item) => item.artworkId === artworkId,
      );
      for (const item of matchingItems) {
        proposalItems.push({
          proposal,
          item,
          userId: proposal.userId,
          userName: userMap.get(proposal.userId)?.name,
          userEmail: userMap.get(proposal.userId)?.email,
          dealerId: proposal.dealerId,
        });
      }
    }

    return {
      preferences: {
        total: preferenceItems.length,
        likes,
        dislikes,
        items: preferenceItems,
      },
      comments: {
        totalUsers: commentUsers.size,
        totalComments: commentItems.length,
        items: commentItems,
      },
      proposals: {
        totalActive: proposalItems.length,
        items: proposalItems,
      },
    };
  }

  private async getUserSummaries(
    domainId: string,
    userIds: Set<string>,
  ): Promise<Map<string, { name?: string; email?: string }>> {
    const now = Date.now();
    const result = new Map<string, { name?: string; email?: string }>();
    const missingIds: string[] = [];

    for (const userId of userIds) {
      const cacheKey = `${domainId}:${userId}`;
      const cached = this.userCache.get(cacheKey);
      if (cached && now - cached.cachedAt < this.userCacheTtlMs) {
        result.set(userId, { name: cached.name, email: cached.email });
      } else {
        missingIds.push(userId);
      }
    }

    if (missingIds.length === 0) {
      return result;
    }

    const usersContainer = await this.cosmosService.getContainer("Core");
    const usersQuery = {
      query: `
        SELECT c.id, c.name, c.email
        FROM c
        WHERE c.type = 'user' AND c.domainId = @domainId
          AND ARRAY_CONTAINS(@userIds, c.id)
      `,
      parameters: [
        { name: "@domainId", value: domainId },
        { name: "@userIds", value: missingIds },
      ],
    };
    const { resources } = await usersContainer.items
      .query(usersQuery, { partitionKey: domainId })
      .fetchAll();

    (resources ?? []).forEach(
      (u: { id: string; name?: string; email?: string }) => {
        const cacheKey = `${domainId}:${u.id}`;
        this.userCache.set(cacheKey, {
          name: u.name,
          email: u.email,
          cachedAt: now,
        });
        result.set(u.id, { name: u.name, email: u.email });
      },
    );

    return result;
  }

  private canViewerSeeArtwork(
    artwork: Artwork,
    viewer?: { id: string; role: string; invitedBy?: string | null },
  ): boolean {
    if (viewer?.role === "customer" && isAuctionEnded(artwork)) {
      return false;
    }
    if (!artwork.isPrivate) {
      return true;
    }
    if (!viewer) {
      return true;
    }
    if (viewer.role === "global_admin" || viewer.role === "domain_owner") {
      return true;
    }
    if (viewer.role === "dealer") {
      return artwork.uploadedBy === viewer.id;
    }
    // if (viewer.role === "customer") {
    //   return Boolean(
    //     viewer.invitedBy && artwork.uploadedBy === viewer.invitedBy,
    //   );
    // }
    return false;
  }
}

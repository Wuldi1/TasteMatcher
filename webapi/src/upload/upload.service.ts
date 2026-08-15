import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Artwork,
  BlobService,
  CosmosService,
  ImageProcessingQueueMessage,
  Role,
  VectorizationService,
  cleanupArtworkBeforeResponseToClient,
  getOriginalBlobPath,
} from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";

export interface ArtworkUploadFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export type ArtworkIngestionStage =
  | "image_validation"
  | "upload"
  | "persistence";

export class ArtworkIngestionError extends Error {
  constructor(
    public readonly stage: ArtworkIngestionStage,
    public readonly originalError: unknown,
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "Artwork ingestion failed",
    );
    this.name = "ArtworkIngestionError";
  }
}

export interface ArtworkSourceIdentityLookup {
  provider: string;
  sourceAuctionUrl: string;
  sourceLotNumber: string;
}

interface UploadActor {
  id: string;
  role: Role;
}

/** Shared artwork ingestion behavior used by manual and automatic uploads. */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly blobService: BlobService,
    private readonly cosmosService: CosmosService,
    private readonly vectorizationService: VectorizationService,
  ) {}

  async uploadManualArtwork(
    domainId: string,
    file: ArtworkUploadFile,
    body: unknown,
    actor: UploadActor,
  ): Promise<Artwork> {
    const artwork = this.parseArtworkPayload(body, domainId);
    return this.ingestArtwork(domainId, file, artwork, actor);
  }

  async uploadAutomaticArtwork(
    domainId: string,
    file: ArtworkUploadFile,
    artworkInput: Partial<Artwork>,
    actor: UploadActor,
    forcedArtworkId?: string,
  ): Promise<Artwork> {
    return this.ingestArtwork(
      domainId,
      file,
      this.buildArtwork(domainId, artworkInput, forcedArtworkId),
      actor,
    );
  }

  async replaceArtworkImage(
    domainId: string,
    artworkId: string,
    file: ArtworkUploadFile,
    viewerRole: Role,
  ): Promise<Artwork> {
    this.blobService.validateImageFile(
      file as Parameters<BlobService["validateImageFile"]>[0],
    );
    const container = await this.cosmosService.getArtworksContainer();
    const { resource: existingArtwork } = await container
      .item(artworkId, domainId)
      .read<Artwork>();
    if (!existingArtwork) {
      throw new NotFoundException(`Artwork ${artworkId} not found`);
    }

    const blobName = getOriginalBlobPath(domainId, artworkId, file.mimetype);
    const artworkUrl = await this.blobService.uploadBlob(
      "originals",
      blobName,
      file.buffer,
      file.mimetype,
    );
    const { resource } = await container.item(artworkId, domainId).replace({
      ...existingArtwork,
      filename: artworkUrl,
      thumbnails: undefined,
    });
    await this.blobService.sendMessageToQueue({
      messageId: uuidv4(),
      artworkId,
      domainId,
      blobName,
      fileUrl: artworkUrl,
      uploadedAt: Date.now(),
    });
    this.logger.log({
      action: "replaceArtworkImage.success",
      domainId,
      artworkId,
    });
    return cleanupArtworkBeforeResponseToClient(
      resource as unknown as Artwork,
      viewerRole,
    ) as Artwork;
  }

  async findArtworkBySourceIdentity(
    domainId: string,
    identity: ArtworkSourceIdentityLookup,
  ): Promise<Pick<Artwork, "id"> | undefined> {
    const container = await this.cosmosService.getArtworksContainer();
    const { resources } = await container.items
      .query<Pick<Artwork, "id">>(
        {
          query: `SELECT TOP 1 c.id FROM c
            WHERE c.type = @type AND c.domainId = @domainId
            AND c.metadata.automaticUpload.provider = @provider
            AND c.metadata.automaticUpload.sourceAuctionUrl = @sourceAuctionUrl
            AND c.metadata.automaticUpload.sourceLotNumber = @sourceLotNumber`,
          parameters: [
            { name: "@type", value: "artwork" },
            { name: "@domainId", value: domainId },
            { name: "@provider", value: identity.provider },
            { name: "@sourceAuctionUrl", value: identity.sourceAuctionUrl },
            { name: "@sourceLotNumber", value: identity.sourceLotNumber },
          ],
        },
        { partitionKey: domainId },
      )
      .fetchAll();
    return resources[0];
  }

  private async ingestArtwork(
    domainId: string,
    file: ArtworkUploadFile,
    artwork: Artwork,
    actor: UploadActor,
  ): Promise<Artwork> {
    try {
      this.blobService.validateImageFile(
        file as Parameters<BlobService["validateImageFile"]>[0],
      );
    } catch (error) {
      throw new ArtworkIngestionError("image_validation", error);
    }

    const blobName = getOriginalBlobPath(domainId, artwork.id, file.mimetype);
    this.logger.debug({
      action: "uploadArtwork.start",
      artworkId: artwork.id,
      domainId,
      blobName,
      containerId: "originals",
      fileSize: file.size,
      fileMimeType: file.mimetype,
    });
    try {
      artwork.filename = await this.blobService.uploadBlob(
        "originals",
        blobName,
        file.buffer,
        file.mimetype,
      );
    } catch (error) {
      throw new ArtworkIngestionError("upload", error);
    }

    artwork.isPrivate = artwork.isPrivate ?? false;
    artwork.uploadedBy = actor.id;
    try {
      const embedding = await this.vectorizationService.generateEmbedding(
        artwork.filename,
        artwork.id,
      );
      artwork.vector = embedding.vector;
      artwork.vectorModel = embedding.model;
    } catch (error) {
      this.logger.warn({
        action: "uploadArtwork.vectorize.failed",
        artworkId: artwork.id,
        domainId,
        errMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }

    artwork.createdAt = Date.now();
    let createdArtwork: Artwork | undefined;
    try {
      const container = await this.cosmosService.getArtworksContainer();
      const response = await container.items.create(artwork);
      createdArtwork = response.resource as Artwork | undefined;
    } catch (error) {
      throw new ArtworkIngestionError("persistence", error);
    }
    if (!createdArtwork) {
      throw new ArtworkIngestionError(
        "persistence",
        new Error("Artwork persistence returned no resource"),
      );
    }

    this.logger.log({
      action: "createArtworkRecord.success",
      artworkId: artwork.id,
      domainId,
    });
    const disabledMessage: ImageProcessingQueueMessage = {
      messageId: uuidv4(),
      artworkId: artwork.id,
      domainId: artwork.domainId,
      blobName,
      fileUrl: artwork.filename,
      uploadedAt: Date.now(),
    };
    console.log(
      "image-processing operation via AZ-Func is disabled - " +
        disabledMessage.messageId,
    );
    return cleanupArtworkBeforeResponseToClient(
      createdArtwork,
      actor.role,
    ) as Artwork;
  }

  private parseArtworkPayload(body: unknown, domainId: string): Artwork {
    let raw: unknown = body;
    if (typeof raw === "string") {
      raw = this.parseJson(raw);
    } else if (this.isRecord(raw)) {
      raw =
        "artwork" in raw ? raw.artwork : "metadata" in raw ? raw.metadata : raw;
    }
    if (typeof raw === "string") {
      raw = this.parseJson(raw);
    }
    if (raw !== undefined && raw !== null && !this.isRecord(raw)) {
      throw new BadRequestException("Invalid artwork metadata payload");
    }
    return this.buildArtwork(domainId, (raw ?? {}) as Partial<Artwork>);
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException("Invalid artwork metadata payload");
    }
  }

  private buildArtwork(
    domainId: string,
    parsed: Partial<Artwork>,
    forcedArtworkId?: string,
  ): Artwork {
    return {
      id: forcedArtworkId ?? uuidv4(),
      domainId,
      type: "artwork",
      title: parsed.title ?? "",
      artist: parsed.artist ?? "",
      description: parsed.description ?? "",
      signature: parsed.signature ?? "",
      medium: parsed.medium ?? "",
      width: this.toNumber(parsed.width),
      height: this.toNumber(parsed.height),
      depth: this.toNumber(parsed.depth),
      price: this.toNumber(parsed.price),
      maxPrice: this.toNumber(parsed.maxPrice),
      date: parsed.date ?? "",
      endDate: parsed.endDate ? String(parsed.endDate) : undefined,
      shouldDisplayPrice: parsed.shouldDisplayPrice ?? false,
      useForTaster: parsed.useForTaster ?? false,
      isPrivate: parsed.isPrivate ?? false,
      isAuction: !!parsed.isAuction,
      filename: parsed.filename ?? "unknown",
      tags: this.parseTags(parsed.tags),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: parsed.metadata,
      vector: [],
      vectorModel: "",
    } as Artwork;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseTags(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((tag): tag is string => typeof tag === "string");
    }
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      return [];
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

// webapi/src/upload/upload.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  Artwork,
  BlobService,
  CosmosService,
  ImageProcessingQueueMessage,
  VectorizationService,
  cleanupArtworkBeforeResponseToClient,
  getOriginalBlobPath,
} from "@tastematcher/common";
import { v4 as uuidv4 } from "uuid";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";

@Controller("domains/:domainId/uploads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);
  private readonly blobService: BlobService;
  private readonly cosmosService: CosmosService;
  private readonly vectorizationService: VectorizationService;

  constructor() {
    this.blobService = new BlobService();
    this.cosmosService = new CosmosService();
    this.vectorizationService = new VectorizationService();
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadArtwork(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    // eslint-disable-next-line
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ): Promise<Artwork> {
    const start = Date.now();
    this.logger.debug({
      route: "/domains/:domainId/uploads",
      method: "POST",
      domainId,
    });

    if (domainId !== req.user.domainId && req.user.role !== "global_admin") {
      throw new BadRequestException("Unauthorized domain access");
    }

    if (!file) {
      throw new BadRequestException("File is required");
    }

    try {
      this.blobService.validateImageFile(file);

      // Pass artworkData directly, not wrapped
      const artworkMetadata = this.parseArtworkPayload(body, domainId);
      const blobName = getOriginalBlobPath(
        domainId,
        artworkMetadata.id,
        file.mimetype,
      );

      this.logger.debug({
        action: "uploadArtwork.start",
        artworkId: artworkMetadata.id,
        domainId,
        blobName,
        containerId: "originals",
        fileSize: file.size,
        fileMimeType: file.mimetype,
      });

      // upload file to blob storage
      const artworkUrl = await this.blobService.uploadBlob(
        "originals",
        blobName,
        file.buffer,
        file.mimetype,
      );
      artworkMetadata.filename = artworkUrl;
      artworkMetadata.isPrivate = artworkMetadata.isPrivate ?? false;
      artworkMetadata.uploadedBy = req.user.id;

      try {
        const vectorEmbedding =
          await this.vectorizationService.generateEmbedding(
            artworkUrl,
            artworkMetadata.id,
          );
        artworkMetadata.vector = vectorEmbedding.vector;
        artworkMetadata.vectorModel = vectorEmbedding.model;
      } catch (vectorError) {
        this.logger.warn({
          action: "uploadArtwork.vectorize.failed",
          artworkId: artworkMetadata.id,
          domainId,
          errMessage: (vectorError as Error).message,
        });
      }

      // write artwork record to database
      artworkMetadata.createdAt = Date.now();

      const artworksContainer = await this.cosmosService.getArtworksContainer();
      const { resource: createdArtwork } =
        await artworksContainer.items.create(artworkMetadata);

      this.logger.log({
        action: "createArtworkRecord.success",
        artworkId: artworkMetadata.id,
      });

      // send message to queue for additional processing (thumbnail generation, vectorization, indexing)
      const imageProcessingQueueMessage: ImageProcessingQueueMessage = {
        messageId: uuidv4(),
        artworkId: artworkMetadata.id,
        domainId: artworkMetadata.domainId,
        blobName,
        fileUrl: artworkMetadata.filename,
        uploadedAt: Date.now(),
      };
      console.log(
        "image-processing operation via AZ-Func is disabled - " +
          imageProcessingQueueMessage.messageId,
      );
      // await this.blobService.sendMessageToQueue(imageProcessingQueueMessage);

      this.logger.log({
        route: "/domains/:domainId/uploads",
        method: "POST",
        domainId,
        durationMs: Date.now() - start,
      });

      return cleanupArtworkBeforeResponseToClient(
        createdArtwork as Artwork,
        req.user.role,
      ) as Artwork;
    } catch (error) {
      this.logger.error({
        route: "/domains/:domainId/uploads",
        method: "POST",
        domainId,
        errMessage: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  @Post(":artworkId/image")
  @UseInterceptors(FileInterceptor("file"))
  async replaceArtworkImage(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
    // eslint-disable-next-line
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Artwork> {
    this.logger.debug({
      route: "/domains/:domainId/uploads/:artworkId/image",
      method: "POST",
      domainId,
      artworkId,
    });

    if (domainId !== req.user.domainId && req.user.role !== "global_admin") {
      throw new BadRequestException("Unauthorized domain access");
    }

    if (!file) {
      throw new BadRequestException("File is required");
    }

    this.blobService.validateImageFile(file);

    const artworksContainer = await this.cosmosService.getArtworksContainer();
    const { resource: existingArtwork } = await artworksContainer
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

    const updatedArtwork: Artwork = {
      ...existingArtwork,
      filename: artworkUrl,
      thumbnails: undefined,
    };

    const { resource } = await artworksContainer
      .item(artworkId, domainId)
      .replace(updatedArtwork);

    const imageProcessingQueueMessage: ImageProcessingQueueMessage = {
      messageId: uuidv4(),
      artworkId,
      domainId,
      blobName,
      fileUrl: artworkUrl,
      uploadedAt: Date.now(),
    };
    await this.blobService.sendMessageToQueue(imageProcessingQueueMessage);

    this.logger.log({
      action: "replaceArtworkImage.success",
      domainId,
      artworkId,
    });

    return cleanupArtworkBeforeResponseToClient(
      resource as Artwork,
      req.user.role,
    ) as Artwork;
  }

  private parseArtworkPayload(body: any, domainId: string): Artwork {
    // Accept direct artwork object, JSON strings, or legacy wrappers { artwork } / { metadata }
    let raw: any = body;
    if (typeof body === "string") {
      try {
        raw = JSON.parse(body);
      } catch {
        throw new BadRequestException("Invalid artwork metadata payload");
      }
    } else if (body && typeof body === "object") {
      if ("artwork" in body) {
        raw = (body as any).artwork;
      } else if ("metadata" in body) {
        raw = (body as any).metadata;
      }
    }
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new BadRequestException("Invalid artwork metadata payload");
      }
    }

    const parsed: Partial<Artwork> = raw ?? {};
    const toNumber = (val: unknown): number | undefined => {
      if (val === undefined || val === null || val === "") return undefined;
      const n = Number(val);
      return Number.isNaN(n) ? undefined : n;
    };

    const parseTags = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val as string[];
      if (typeof val === "string") {
        try {
          const parsedTags = JSON.parse(val);
          return Array.isArray(parsedTags) ? parsedTags : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const isAuction = !!parsed.isAuction;

    return {
      id: uuidv4(),
      domainId,
      type: "artwork",
      title: parsed.title ?? "",
      artist: parsed.artist ?? "",
      description: parsed.description ?? "",
      signature: parsed.signature ?? "",
      medium: parsed.medium ?? "",
      width: toNumber(parsed.width),
      height: toNumber(parsed.height),
      depth: toNumber((parsed as any).depth),
      price: toNumber(parsed.price),
      maxPrice: toNumber((parsed as any).maxPrice),
      date: parsed.date ?? "",
      endDate: (parsed as any).endDate
        ? String((parsed as any).endDate)
        : undefined,
      shouldDisplayPrice: parsed.shouldDisplayPrice ?? false,
      useForTaster: parsed.useForTaster ?? false,
      isPrivate: parsed.isPrivate ?? false,
      isAuction,
      filename: parsed.filename ?? "unknown",
      tags: parseTags(parsed.tags),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: parsed.metadata,
      vector: [],
      vectorModel: "",
      uploadedBy: parsed.uploadedBy,
    } as Artwork;
  }
}

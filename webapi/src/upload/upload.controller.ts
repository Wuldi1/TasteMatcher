import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Artwork } from "@tastematcher/common";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import {
  ArtworkIngestionError,
  ArtworkUploadFile,
  UploadService,
} from "./upload.service";

@Controller("domains/:domainId/uploads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadArtwork(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @UploadedFile() file: ArtworkUploadFile,
    @Body() body: Record<string, unknown>,
  ): Promise<Artwork> {
    const start = Date.now();
    this.logger.debug({
      route: "/domains/:domainId/uploads",
      method: "POST",
      domainId,
    });
    this.assertDomainAccess(req, domainId);
    if (!file) throw new BadRequestException("File is required");

    try {
      const artwork = await this.uploadService.uploadManualArtwork(
        domainId,
        file,
        body,
        req.user,
      );
      this.logger.log({
        route: "/domains/:domainId/uploads",
        method: "POST",
        domainId,
        durationMs: Date.now() - start,
      });
      return artwork;
    } catch (error) {
      const originalError =
        error instanceof ArtworkIngestionError ? error.originalError : error;
      this.logger.error({
        route: "/domains/:domainId/uploads",
        method: "POST",
        domainId,
        errMessage:
          originalError instanceof Error
            ? originalError.message
            : "Artwork upload failed",
        stack: originalError instanceof Error ? originalError.stack : undefined,
      });
      throw originalError;
    }
  }

  @Post(":artworkId/image")
  @UseInterceptors(FileInterceptor("file"))
  async replaceArtworkImage(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("artworkId") artworkId: string,
    @UploadedFile() file: ArtworkUploadFile,
  ): Promise<Artwork> {
    this.logger.debug({
      route: "/domains/:domainId/uploads/:artworkId/image",
      method: "POST",
      domainId,
      artworkId,
    });
    this.assertDomainAccess(req, domainId);
    if (!file) throw new BadRequestException("File is required");
    return this.uploadService.replaceArtworkImage(
      domainId,
      artworkId,
      file,
      req.user.role,
    );
  }

  private assertDomainAccess(
    req: AuthenticatedRequest,
    domainId: string,
  ): void {
    if (domainId !== req.user.domainId && req.user.role !== "global_admin") {
      throw new BadRequestException("Unauthorized domain access");
    }
  }
}

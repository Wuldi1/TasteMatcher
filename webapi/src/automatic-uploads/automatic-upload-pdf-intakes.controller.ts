import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Request,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  AutomaticUploadApprovalResponse,
  AutomaticUploadPdfIntakeDetail,
  AutomaticUploadPdfIntakeIngestResponse,
  AutomaticUploadPdfIntakeListItem,
} from "@tastematcher/common";
import { timingSafeEqual } from "crypto";
import { Response } from "express";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { Roles } from "../auth/utils/roles.decorator";
import {
  AutomaticUploadPdfIntakesService,
  PdfIntakeIngestFields,
  PdfIntakeUpload,
} from "./automatic-upload-pdf-intakes.service";

@Controller("internal/automatic-upload-pdf-intakes")
export class AutomaticUploadPdfIntakesInternalController {
  constructor(private readonly service: AutomaticUploadPdfIntakesService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "pdf", maxCount: 1 },
        { name: "importFile", maxCount: 1 },
      ],
      { limits: { fileSize: 25 * 1024 * 1024, files: 2 } },
    ),
  )
  ingest(
    @Headers("x-automatic-upload-intake-key") apiKey: string | undefined,
    @Body() fields: PdfIntakeIngestFields,
    @UploadedFiles()
    files?: { pdf?: PdfIntakeUpload[]; importFile?: PdfIntakeUpload[] },
  ): Promise<AutomaticUploadPdfIntakeIngestResponse> {
    this.assertApiKey(apiKey);
    return this.service.ingest(fields, files?.pdf?.[0], files?.importFile?.[0]);
  }

  private assertApiKey(actual: string | undefined): void {
    const expected = process.env.AUTOMATIC_UPLOAD_INTAKE_API_KEY?.trim();
    if (!expected || !actual) throw new UnauthorizedException();
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException();
    }
  }
}

@Controller("domains/:domainId/automatic-uploads/pdf-intakes")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("domain_owner", "global_admin")
export class AutomaticUploadPdfIntakesController {
  constructor(private readonly service: AutomaticUploadPdfIntakesService) {}

  @Get()
  list(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
  ): Promise<AutomaticUploadPdfIntakeListItem[]> {
    this.assertDomainAccess(req, domainId);
    return this.service.list(domainId);
  }

  @Get(":intakeId")
  get(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("intakeId") intakeId: string,
  ): Promise<AutomaticUploadPdfIntakeDetail> {
    this.assertDomainAccess(req, domainId);
    return this.service.get(domainId, intakeId, req.user);
  }

  @Get(":intakeId/source")
  async downloadSource(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("intakeId") intakeId: string,
    @Res() response: Response,
  ): Promise<void> {
    this.assertDomainAccess(req, domainId);
    const source = await this.service.downloadSource(domainId, intakeId);
    const filename = source.filename.replace(/["\r\n]/gu, "-");
    response.set({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${filename}"`,
    });
    response.send(source.buffer);
  }

  @Post(":intakeId/approve")
  approve(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Param("intakeId") intakeId: string,
    @Body() body: unknown,
  ): Promise<AutomaticUploadApprovalResponse> {
    this.assertDomainAccess(req, domainId);
    return this.service.approve(domainId, intakeId, req.user, body);
  }

  private assertDomainAccess(
    req: AuthenticatedRequest,
    domainId: string,
  ): void {
    if (req.user.role !== "global_admin" && req.user.domainId !== domainId) {
      throw new ForbiddenException(
        "You are not authorized to access this domain's PDF inventory.",
      );
    }
  }
}

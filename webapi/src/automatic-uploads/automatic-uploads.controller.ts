import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  AutomaticUploadApprovalResponse,
  AutomaticUploadPreviewResponse,
} from "@tastematcher/common";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { Roles } from "../auth/utils/roles.decorator";
import { AutomaticUploadsService } from "./automatic-uploads.service";

@Controller("domains/:domainId/automatic-uploads")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("domain_owner", "global_admin")
export class AutomaticUploadsController {
  constructor(private readonly service: AutomaticUploadsService) {}

  @Post("preview")
  preview(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Body() body: unknown,
  ): Promise<AutomaticUploadPreviewResponse> {
    this.assertDomainAccess(req, domainId);
    return this.service.preview(domainId, req.user, body);
  }

  @Post("approve")
  approve(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
    @Body() body: unknown,
  ): Promise<AutomaticUploadApprovalResponse> {
    this.assertDomainAccess(req, domainId);
    return this.service.approve(domainId, req.user, body);
  }

  private assertDomainAccess(
    req: AuthenticatedRequest,
    domainId: string,
  ): void {
    if (req.user.role !== "global_admin" && req.user.domainId !== domainId) {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
  }
}

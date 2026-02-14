import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Domain, DomainRequest } from "@tastematcher/common";
import { AuthenticatedRequest } from "../auth/types/authenticated-request.interface";
import { JwtAuthGuard } from "../auth/utils/jwt-auth.guard";
import { Roles } from "../auth/utils/roles.decorator";
import { RolesGuard } from "../auth/utils/roles.guard";
import { DomainsService } from "./domains.service";
import { CreateDomainRequestDto } from "./dto/create-domain-request.dto";
import { UpdateDomainDto } from "./dto/update-domain.dto";

@ApiTags("domains")
@Controller("domains")
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);

  constructor(private readonly domainsService: DomainsService) {}

  @Get(":domainId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getDomain(
    @Request() req: AuthenticatedRequest,
    @Param("domainId") domainId: string,
  ): Promise<Domain> {
    this.logger.debug({
      route: "GET /domains/:domainId",
      domainId,
      userId: req.user.id,
    });
    if (req.user.domainId !== domainId && req.user.role !== "global_admin") {
      throw new ForbiddenException(
        "You are not authorized to access this domain.",
      );
    }
    return this.domainsService.findDomainById(domainId);
  }

  /**
   * Get all domains (global_admin only)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  async findAll(): Promise<Domain[]> {
    return this.domainsService.findAll();
  }

  /**
   * Get a specific domain by ID (global_admin only)
   */
  @Get(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  async findOne(@Param("id") domainId: string): Promise<Domain> {
    return this.domainsService.findOne(domainId);
  }

  /**
   * Update a domain (global_admin only)
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  async update(
    @Param("id") domainId: string,
    @Body() updateDto: UpdateDomainDto,
  ): Promise<Domain> {
    return this.domainsService.update(domainId, updateDto);
  }

  /**
   * Delete a domain and all associated data (global_admin only)
   */
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") domainId: string): Promise<void> {
    return this.domainsService.remove(domainId);
  }

  /**
   * Create a new domain or resend verification (global_admin only)
   */
  @Post("create")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  async createDomain(
    @Body() createDto: CreateDomainRequestDto,
  ): Promise<Domain> {
    return this.domainsService.createOrResendDomain(createDto);
  }

  /**
   * Get all domain requests (global_admin only)
   */
  @Get("requests/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("global_admin")
  async getAllRequests(): Promise<DomainRequest[]> {
    return this.domainsService.getAllDomainRequests();
  }
}

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Domain } from 'common';
import { DomainDto } from './dto/domain.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDomain(domainDto: DomainDto): Promise<Domain> {
    const { name, adminEmail } = domainDto;

    // Normalize email to lowercase for consistency
    const normalizedAdminEmail = adminEmail.toLowerCase().trim();

    // Check if admin email is already used by another domain
    const existingDomain = await this.prisma.domain.findUnique({
      where: { adminEmail: normalizedAdminEmail }
    });

    if (existingDomain) {
      throw new ConflictException(`Domain with admin email '${normalizedAdminEmail}' already exists`);
    }

    try {
      const domain = await this.prisma.domain.create({
        data: {
          id: uuidv4(),
          name,
          adminEmail: normalizedAdminEmail,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Created domain: ${domain.id} (${domain.name}) with admin email: ${domain.adminEmail}`);

      return {
        id: domain.id,
        name: domain.name,
        adminEmail: domain.adminEmail,
        createdAt: domain.createdAt.getTime(),
        updatedAt: domain.updatedAt.getTime(),
      };
    } catch (error) {
      this.logger.error(`Failed to create domain:`, error);
      throw new ConflictException('Failed to create domain');
    }
  }

  async getDomainByEmail(adminEmail: string): Promise<Domain> {
    try {
      const domain = await this.prisma.domain.findUnique({
        where: { adminEmail },
      });

      if (!domain) {
        throw new NotFoundException(`Domain that belongs to ${adminEmail} not found`);
      }

      return {
        id: domain.id,
        name: domain.name,
        adminEmail: domain.adminEmail,
        createdAt: domain.createdAt.getTime(),
        updatedAt: domain.updatedAt.getTime(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch domain with email ${adminEmail}:`, error);
      throw error;
    }
  }
}

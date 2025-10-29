import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Domain } from 'common';
import { DomainDto } from './dto/domain.dto';
import { CosmosService } from '../cosmos/cosmos.service';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(private readonly cosmos: CosmosService) {}

  async createDomain(domainDto: DomainDto): Promise<Domain> {
    const { name, adminEmail } = domainDto;

    // Normalize email to lowercase for consistency
    const normalizedAdminEmail = adminEmail.toLowerCase().trim();

    try {
      const domainsContainer = await this.cosmos.getDomainsContainer();
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.adminEmail = @adminEmail',
        parameters: [{ name: '@adminEmail', value: normalizedAdminEmail }],
      };
      const { resources: existingDomains } = await domainsContainer.items.query(querySpec).fetchAll();

      if (existingDomains.length > 0) {
        throw new ConflictException(`Domain with admin email '${normalizedAdminEmail}' already exists`);
      }

      const domainId = uuidv4();
      const now = new Date().toISOString();

      const domainItem = {
        id: domainId,
        name,
        adminEmail: normalizedAdminEmail,
        createdAt: now,
        updatedAt: now,
      };

      const { resource: createdDomain } = await domainsContainer.items.create(domainItem);

      if (!createdDomain) {
        throw new ConflictException('Failed to create domain');
      }

      this.logger.log(`Created domain: ${createdDomain.id} (${createdDomain.name}) with admin email: ${createdDomain.adminEmail}`);

      return {
        id: createdDomain.id,
        name: createdDomain.name,
        adminEmail: createdDomain.adminEmail,
        createdAt: new Date(createdDomain.createdAt).getTime(),
        updatedAt: new Date(createdDomain.updatedAt).getTime(),
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Failed to create domain:', error);
      throw new ConflictException('Failed to create domain');
    }
  }

  async getDomainByEmail(adminEmail: string): Promise<Domain> {
    try {
      const normalizedAdminEmail = adminEmail.toLowerCase().trim();
      const domainsContainer = await this.cosmos.getDomainsContainer();
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.adminEmail = @adminEmail',
        parameters: [{ name: '@adminEmail', value: normalizedAdminEmail }],
      };

      const { resources: domains } = await domainsContainer.items.query(querySpec).fetchAll();

      if (domains.length === 0) {
        throw new NotFoundException(`Domain that belongs to ${adminEmail} not found`);
      }

      const domain = domains[0];
      return {
        id: domain.id,
        name: domain.name,
        adminEmail: domain.adminEmail,
        createdAt: new Date(domain.createdAt).getTime(),
        updatedAt: new Date(domain.updatedAt).getTime(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch domain with email ${adminEmail}:`, error);
      throw error;
    }
  }

  async getDomainById(id: string): Promise<Domain> {
    try {
      const domainsContainer = await this.cosmos.getDomainsContainer();
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.id = @id',
        parameters: [{ name: '@id', value: id }],
      };

      const { resources: domains } = await domainsContainer.items.query(querySpec).fetchAll();

      if (domains.length === 0) {
        throw new NotFoundException(`Domain with ID ${id} not found`);
      }

      const domain = domains[0];
      return {
        id: domain.id,
        name: domain.name,
        adminEmail: domain.adminEmail,
        createdAt: new Date(domain.createdAt).getTime(),
        updatedAt: new Date(domain.updatedAt).getTime(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch domain ${id}:`, error);
      throw error;
    }
  }
}

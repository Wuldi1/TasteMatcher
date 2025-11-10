// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Health check validates all critical dependencies.
// 3. Returns 200 only when all services are healthy.
// 4. Includes version and environment information.
// 5. Does not expose sensitive configuration details.
// -----------------------------------------------------------

import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BlobService, CosmosService } from '@tastematcher/common';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  version: string;
  environment: string;
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    storage: 'ok' | 'error';
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
private readonly cosmosService: CosmosService;
private readonly blobService: BlobService;

  constructor() {
    this.cosmosService = new CosmosService();
    this.blobService = new BlobService();
  }

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async checkHealth(): Promise<HealthStatus> {
    const checks = {
      database: 'error' as 'ok' | 'error',
      storage: 'error' as 'ok' | 'error',
    };

    // Check Cosmos DB
    try {
      const container = await this.cosmosService.getContainer('Domains');
      await container.read();
      checks.database = 'ok';
    } catch (_) {
      checks.database = 'error';
    }

    // Check Blob Storage
    try {
      const containerClient = await this.blobService.getBlobContainerClient('originals');
      await containerClient.exists();
      checks.storage = 'ok';
    } catch (_) {
      checks.storage = 'error';
    }

    const status: HealthStatus = {
      status: checks.database === 'ok' && checks.storage === 'ok' ? 'healthy' : 'unhealthy',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      checks,
    };

    if (status.status === 'unhealthy') {
      throw new HttpException(status, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return status;
  }
}
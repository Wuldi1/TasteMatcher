// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Health check validates all critical dependencies.
// 3. Returns 200 only when all services are healthy.
// 4. Includes version and environment information.
// 5. Does not expose sensitive configuration details.
// -----------------------------------------------------------

import { Controller, Get, HttpStatus, HttpException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { BlobService, CosmosService } from "@tastematcher/common";

interface HealthStatus {
  status: "healthy" | "unhealthy";
  version: string;
  deploymentVersion?: string;
  commit?: string;
  environment: string;
  timestamp: string;
  checks: {
    database: "ok" | "error";
    storage: "ok" | "error";
  };
}

export const HEALTH_DEPENDENCY_TIMEOUT_MS = 5_000;

@ApiTags("health")
@Controller("health")
export class HealthController {
  private readonly cosmosService: CosmosService;
  private readonly blobService: BlobService;

  constructor() {
    this.cosmosService = new CosmosService();
    this.blobService = new BlobService();
  }

  @Get()
  @ApiOperation({ summary: "Health check endpoint" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  @ApiResponse({ status: 503, description: "Service is unhealthy" })
  async checkHealth(): Promise<HealthStatus> {
    const [database, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
    ]);
    const checks = { database, storage };

    const status: HealthStatus = {
      status:
        checks.database === "ok" && checks.storage === "ok"
          ? "healthy"
          : "unhealthy",
      version: process.env.npm_package_version || "1.0.0",
      deploymentVersion: process.env.APP_VERSION,
      commit: process.env.APP_COMMIT?.slice(0, 12),
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      checks,
    };

    if (status.status === "unhealthy") {
      throw new HttpException(status, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return status;
  }

  private async checkDatabase(): Promise<"ok" | "error"> {
    try {
      await this.withTimeout(async (abortSignal) => {
        const container = await this.cosmosService.getContainer("Core");
        await container.read({ abortSignal });
      });
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkStorage(): Promise<"ok" | "error"> {
    try {
      const exists = await this.withTimeout(async (abortSignal) => {
        const containerClient =
          await this.blobService.getBlobContainerClient("originals");
        return containerClient.exists({ abortSignal });
      });
      return exists ? "ok" : "error";
    } catch {
      return "error";
    }
  }

  private async withTimeout<T>(
    operation: (abortSignal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => {
              controller.abort();
              reject(new Error("Health dependency check timed out"));
            },
            HEALTH_DEPENDENCY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

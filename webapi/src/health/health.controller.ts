import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor() {}

  @Get()
  health(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'ok' });
  }
}
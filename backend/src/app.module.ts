import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { TestModule } from './test/test.module';

@Module({
  imports: [HealthModule, TestModule],
})
export class AppModule {}
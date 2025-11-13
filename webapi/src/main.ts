import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  // Global prefix is already 'api' in controller routes
  // So don't set it here if your routes already include /api/
  // app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 8080;
  const host = '0.0.0.0'; // Required for Azure Web Apps
  
  await app.listen(port, host);
  
  console.log(`Application is running on: http://${host}:${port}`);
}
bootstrap();
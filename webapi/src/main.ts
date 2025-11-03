import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation with transformation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,        // Transform plain objects to DTO instances
      whitelist: true,        // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if extra properties exist
    }),
  );

    // Enable CORS for http://10.100.102.2:3001
  app.enableCors({
    origin: 'http://10.100.102.2:3001',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow cookies if needed
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
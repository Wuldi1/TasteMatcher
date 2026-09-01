import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { configureHttpBodyParsers } from "./http-body-parser";
import {
  assertSafeRuntimeProfile,
  isLocalProductionRuntime,
} from "./config/runtime-profile";

async function bootstrap() {
  assertSafeRuntimeProfile();
  if (isLocalProductionRuntime()) {
    console.warn(
      "WARNING: local API is connected to PRODUCTION data; only verification email delivery is enabled.",
    );
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Azure Container Apps terminates TLS at its ingress proxy. Trust the first
  // proxy so forwarded protocol and client-address information remain correct.
  app.set("trust proxy", 1);
  configureHttpBodyParsers(app);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",") || "*",
    credentials: true,
  });

  // Global prefix is already 'api' in controller routes
  // So don't set it here if your routes already include /
  // app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = isLocalProductionRuntime() ? "127.0.0.1" : "0.0.0.0";
  await app.listen(port, host);

  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

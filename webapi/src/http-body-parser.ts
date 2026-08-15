import { NestExpressApplication } from "@nestjs/platform-express";

export const JSON_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

/** Registers bounded non-multipart parsers; Multer remains route-scoped. */
export function configureHttpBodyParsers(
  app: Pick<NestExpressApplication, "useBodyParser">,
): void {
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT_BYTES });
  app.useBodyParser("urlencoded", {
    extended: true,
    limit: JSON_BODY_LIMIT_BYTES,
  });
}

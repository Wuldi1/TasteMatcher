import pino from "pino";
import { Writable } from "stream";

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

class ConsoleMethodStream extends Writable {
  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      const line = chunk.toString().trim();
      if (!line) {
        callback();
        return;
      }

      const parsed = JSON.parse(line) as {
        level?: string;
        msg?: string;
        [key: string]: unknown;
      };
      const { level, msg, ...fields } = parsed;
      const hasFields = Object.keys(fields).length > 0;
      const message = typeof msg === "string" ? msg : line;

      switch (level) {
        case "debug":
          hasFields ? console.debug(message, fields) : console.debug(message);
          break;
        case "warn":
          hasFields ? console.warn(message, fields) : console.warn(message);
          break;
        case "error":
        case "fatal":
          hasFields ? console.error(message, fields) : console.error(message);
          break;
        default:
          hasFields ? console.info(message, fields) : console.info(message);
          break;
      }
    } catch {
      console.info(chunk.toString().trim());
    }
    callback();
  }
}

const hasAppInsightsConfig = Boolean(
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
    process.env.APPINSIGHTS_INSTRUMENTATIONKEY,
);

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
},
hasAppInsightsConfig ? new ConsoleMethodStream() : undefined);

export function createLogger(component: string): Logger {
  return baseLogger.child({ component });
}

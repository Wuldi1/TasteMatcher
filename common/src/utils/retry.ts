import { Logger } from "../lib/logger";

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Execute operation with exponential backoff retry.
 * @param operation - Async operation to retry
 * @param config - Retry configuration
 * @param correlationId - Correlation ID for logging
 * @param logger - Logger instance
 * @returns Result of successful operation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  correlationId: string,
  logger: Logger,
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.debug({ attempt, correlationId }, "Attempting operation");
      return await operation();
    } catch (err) {
      lastError = err as Error;
      logger.warn(
        {
          attempt,
          maxAttempts: config.maxAttempts,
          delayMs: delay,
          correlationId,
          errorMessage: lastError.message,
        },
        "Operation failed, retrying",
      );

      if (attempt < config.maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }

  logger.error(
    { correlationId, err: lastError },
    "Operation failed after all retries",
  );
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { createLogger } from "./logger";

const logger = createLogger("Metrics");

interface MetricTags {
  [key: string]: string | number;
}

/**
 * Simple metrics facade for Application Insights
 * In production, integrate with Azure Application Insights SDK
 */
class Metrics {
  increment(name: string, tags?: MetricTags): void {
    logger.debug({
      metric: "increment",
      name,
      tags,
    });
    // TODO: Integrate with Application Insights trackMetric
  }

  timing(name: string, value: number, tags?: MetricTags): void {
    logger.debug({
      metric: "timing",
      name,
      value,
      tags,
    });
    // TODO: Integrate with Application Insights trackMetric
  }
}

export const metrics = new Metrics();

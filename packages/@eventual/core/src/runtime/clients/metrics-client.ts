import { MetricsLogger } from "../metrics/metrics-logger.js";

export interface MetricsClient {
  createMetricsLogger(): MetricsLogger;

  metricScope<T, U extends readonly unknown[]>(
    handler: (m: MetricsLogger) => (...args: U) => T | Promise<T>
  ): (...args: U) => Promise<T>;
}

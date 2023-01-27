import { MetricsClient, MetricsLogger } from "@eventual/runtime-core";

export class TestMetricsClient implements MetricsClient {
  public createMetricsLogger() {
    const logger: MetricsLogger = {
      setTimestamp: () => logger,
      flush: () => Promise.resolve(),
      putDimensions: () => logger,
      putMetric: () => logger,
      resetDimensions: () => logger,
      setDimensions: () => logger,
      setNamespace: () => logger,
      setProperty: () => logger,
    };
    return logger;
  }

  public metricScope<T, U extends readonly unknown[]>(
    handler: (m: MetricsLogger) => (...args: U) => T | Promise<T>
  ): (...args: U) => Promise<T> {
    const logger = this.createMetricsLogger();
    return async (...args) => {
      try {
        return handler(logger)(...args);
      } finally {
        await logger.flush();
      }
    };
  }
}

import { MetricsLogger } from "./metrics-logger.js";
import { Unit } from "./unit.js";

export async function timed<T>(
  metricLogger: MetricsLogger | undefined,
  name: string,
  call: () => Promise<T> | T
): Promise<T> {
  if (metricLogger) {
    const start = new Date();

    const result = await call();

    metricLogger.putMetric(
      name,
      new Date().getTime() - start.getTime(),
      Unit.Milliseconds
    );

    return result;
  } else {
    return call();
  }
}

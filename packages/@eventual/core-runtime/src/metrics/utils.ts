import { MetricsLogger } from "./metrics-logger.js";
import { Unit } from "./unit.js";

export async function timed<T>(
  metricLogger: MetricsLogger,
  name: string,
  call: () => Promise<T> | T
): Promise<T> {
  const start = new Date();

  const result = await call();

  metricLogger.putMetric(
    name,
    new Date().getTime() - start.getTime(),
    Unit.Milliseconds
  );

  return result;
}

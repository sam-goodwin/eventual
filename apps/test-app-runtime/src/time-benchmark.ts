import { activity, eventual } from "@eventual/core";
import { createMetricsLogger, Unit } from "aws-embedded-metrics";

export default eventual(async () => {
  for (let i = 0; i < 10000; i++) {
    await trackTime(await getTime());
  }
});

const getTime = activity("getTime", async () => {
  return new Date().getTime();
});

const trackTime = activity("trackTime", async (timestamp: number) => {
  const logger = createMetricsLogger();
  logger.setNamespace("EventualBenchmark");
  logger.putMetric(
    "EndToEndTime",
    new Date().getTime() - timestamp,
    Unit.Milliseconds
  );
  await logger.flush();
});

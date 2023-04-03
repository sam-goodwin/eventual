import { task, workflow } from "@eventual/core";
import { metricScope, Unit } from "aws-embedded-metrics";

export const bench = workflow("bench", async () => {
  for (let i = 0; i < 10000; i++) {
    await trackTime(await getTime());
  }
});

const getTime = task("getTime", async () => {
  return new Date().getTime();
});

const trackTime = task(
  "trackTime",
  metricScope((logger) => async (timestamp: number) => {
    logger.setNamespace("EventualBenchmark");
    logger.putMetric(
      "EndToEndTime",
      new Date().getTime() - timestamp,
      Unit.Milliseconds
    );
  })
);

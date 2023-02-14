import type { MetricsClient } from "@eventual/core-runtime";
import { createMetricsLogger, metricScope } from "aws-embedded-metrics";

export const AWSMetricsClient: MetricsClient = {
  metricScope,
  createMetricsLogger,
};

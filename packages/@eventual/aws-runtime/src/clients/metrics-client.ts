import type { MetricsClient } from "@eventual/runtime-core";
import { createMetricsLogger, metricScope } from "aws-embedded-metrics";

export const AWSMetricsClient: MetricsClient = {
  metricScope,
  createMetricsLogger,
};

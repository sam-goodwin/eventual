import { MetricsClient } from "@eventual/core";
import { metricScope, createMetricsLogger } from "aws-embedded-metrics";

export const AWSMetricsClient: MetricsClient = {
  metricScope,
  createMetricsLogger,
};

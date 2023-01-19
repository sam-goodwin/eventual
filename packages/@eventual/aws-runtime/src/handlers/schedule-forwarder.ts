import { createScheduleForwarder } from "@eventual/core";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { createLogAgent, createTimerClient } from "../create.js";

export const handle = createScheduleForwarder({
  timerClient: createTimerClient(),
  metricsClient: AWSMetricsClient,
  logAgent: createLogAgent(),
});

import { createScheduleForwarder } from "@eventual/core-runtime";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { createLogAgent, createTimerClient } from "../create.js";

export const handle = createScheduleForwarder({
  timerClient: createTimerClient(),
  metricsClient: AWSMetricsClient,
  logAgent: createLogAgent(),
});

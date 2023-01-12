import { createScheduleForwarder } from "@eventual/core";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { createLogAgent, createTimerClient } from "../clients/create.js";

export const handle = createScheduleForwarder({
  timerClient: createTimerClient({
    scheduleForwarderArn: "NOT NEEDED",
  }),
  metricsClient: AWSMetricsClient,
  logAgent: createLogAgent(),
});

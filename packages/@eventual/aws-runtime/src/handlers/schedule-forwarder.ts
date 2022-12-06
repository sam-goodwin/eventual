import { createScheduleForwarder } from "@eventual/core";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { AWSLoggerClient } from "../clients/logger-client.js";
import { createTimerClient } from "../clients/create.js";

const timerClient = createTimerClient({
  scheduleForwarderArn: "NOT NEEDED",
});

export const handle = createScheduleForwarder(
  timerClient,
  AWSMetricsClient,
  AWSLoggerClient
);

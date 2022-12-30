// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";

import { createActivityWorker } from "@eventual/core";
import middy from "@middy/core";
import {
  createActivityRuntimeClient,
  createEventClient,
  createTimerClient,
  createWorkflowClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { logger, loggerMiddlewares } from "../logger.js";
import { registerTelemetryApi } from "../telemetry.js";
import { trace } from "@opentelemetry/api";
import { serviceName } from "../env.js";

registerTelemetryApi();
const tracer = trace.getTracer(serviceName());

export default middy(
  createActivityWorker({
    activityRuntimeClient: createActivityRuntimeClient(),
    eventClient: createEventClient(),
    workflowClient: createWorkflowClient(),
    timerClient: createTimerClient(),
    metricsClient: AWSMetricsClient,
    logger,
    tracer,
  })
).use(loggerMiddlewares);

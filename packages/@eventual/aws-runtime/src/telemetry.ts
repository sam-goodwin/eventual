import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { CloudWatchSpanExporter } from "src/cloudwatch-span-exporter.js";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  context,
} from "@opentelemetry/api";
import { telemetryLogGroup, telemetryLogStream } from "./env.js";

export function registerTelemetry(): BasicTracerProvider {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "basic-service",
    }),
  });
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new CloudWatchSpanExporter(telemetryLogGroup(), telemetryLogStream())
    )
  );
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  console.log("Registered telemetry");
  return provider;
}

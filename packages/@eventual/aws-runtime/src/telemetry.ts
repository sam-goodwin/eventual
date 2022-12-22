import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import "./fetch-polyfill.js";

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  context,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { serviceName, telemetryComponentName } from "./env.js";

let telemetryProvider: BasicTracerProvider | undefined;

export function registerTelemetryApi(): BasicTracerProvider {
  if (telemetryProvider) {
    return telemetryProvider;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: serviceName(),
      [SemanticResourceAttributes.SERVICE_NAME]: telemetryComponentName(),
    }),
  });
  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({ hostname: "127.0.0.1" }))
  );
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, () => provider.shutdown().catch(console.error));
  });
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  console.log("Registered telemetry api");
  telemetryProvider = provider;
  return telemetryProvider;
}

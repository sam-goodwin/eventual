import {
  BasicTracerProvider,
  TracerConfig,
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
import { serviceName, telemetryComponentName } from "./env.js";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

class EventualTracerProvider extends BasicTracerProvider {
  constructor(config?: TracerConfig) {
    EventualTracerProvider._registeredExporters.set(
      "otlp",
      () => new OTLPTraceExporter()
    );
    super(config);
  }
}

/**
 * Register the openetelemetry provider with the api.
 * The trace exporter exports over otlp/grpc to an extension running as a layer
 * This function will fail if run more than once, and we won't try to save it
 * Ensure that its run during the init phase of the lambda (ie global scope)
 */
export function registerTelemetryApi(): EventualTracerProvider {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
  const provider = new EventualTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: serviceName(),
      [SemanticResourceAttributes.SERVICE_NAME]: telemetryComponentName(),
    }),
  });
  provider.register();
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, () => provider.shutdown().catch(console.error));
  });
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  console.log("Registered telemetry api");
  return provider;
}

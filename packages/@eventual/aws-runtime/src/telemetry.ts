import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import "./fetch-polyfill.js";

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { serviceName, telemetryComponentName } from "./env.js";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";

/**
 * Register the openetelemetry provider with the api.
 * The trace exporter exports over otlp/grpc to an extension running as a layer
 * This function will fail if run more than once, and we won't try to save it
 * Ensure that its run during the init phase of the lambda (ie global scope)
 */
export function registerTelemetryApi(): BasicTracerProvider {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: serviceName(),
      [SemanticResourceAttributes.SERVICE_NAME]: telemetryComponentName(),
    }),
    //Important for traces to show up on xray
    idGenerator: new AWSXRayIdGenerator(),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
  provider.register({ contextManager: new AsyncHooksContextManager() });
  console.log("Registered telemetry api");
  return provider;
}

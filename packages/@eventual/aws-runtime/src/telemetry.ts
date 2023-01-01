import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { B3InjectEncoding, B3Propagator } from "@opentelemetry/propagator-b3";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import { trace, metrics } from "@opentelemetry/api";
import { serviceName, telemetryComponentName } from "./env.js";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";
import { AWSXRayPropagator } from "@opentelemetry/propagator-aws-xray";

/**
 * Register the openetelemetry provider with the api.
 * The trace exporter exports over otlp/grpc to an extension running as a layer
 * This function will fail if run more than once, and we won't try to save it
 * Ensure that its run during the init phase of the lambda (ie global scope)
 */
export function registerTelemetryApi() {
  registerTracerProvider();
  registerMetricsProvider();
}

function registerTracerProvider() {
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: serviceName(),
      [SemanticResourceAttributes.SERVICE_NAME]: telemetryComponentName(),
    }),
    //Important for traces to show up on xray
    idGenerator: new AWSXRayIdGenerator(),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
  const contextManager = new AsyncHooksContextManager();
  provider.register({
    contextManager,
    propagator: new CompositePropagator({
      propagators: [
        new AWSXRayPropagator(),
        new W3CTraceContextPropagator(),
        new B3Propagator(),
        new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
      ],
    }),
  });
  contextManager.enable();
  trace.setGlobalTracerProvider(provider);
}

function registerMetricsProvider() {
  const metricExporter = new OTLPMetricExporter();
  const meterProvider = new MeterProvider({});
  meterProvider.addMetricReader(
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 1000,
    })
  );
  metrics.setGlobalMeterProvider(meterProvider);
}

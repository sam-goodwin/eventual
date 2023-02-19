import { serviceFunctionName } from "@eventual/aws-runtime";
import { FunctionRuntimeProps } from "@eventual/core";
import { computeDurationSeconds } from "@eventual/core-runtime";
import { Duration } from "aws-cdk-lib";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { BuildOutput } from "./build";
import { BundledFunction } from "./build-manifest";
import { baseFnProps } from "./utils";

export interface ServiceFunctionProps {
  overrides?: Omit<Partial<FunctionProps>, "code" | "handler" | "functionName">;
  defaults?: Omit<Partial<FunctionProps>, "code" | "handler" | "functionName">;
  build: BuildOutput;
  bundledFunction: BundledFunction<any>;
  runtimeProps?: FunctionRuntimeProps;
  serviceName: string;
  functionNameSuffix: string;
}

/**
 * Applied Order (later overrides earlier):
 * 1. global default {@link baseFnProps}
 * 1. defaults - system service local defaults
 * 2. runtime props - properties provided by the user in the service code
 * 3. overrides - overrides provided by the user in CDK
 *
 * Deep Merged: environment
 */
export class ServiceFunction extends Function {
  constructor(scope: Construct, id: string, props: ServiceFunctionProps) {
    super(scope, id, {
      ...baseFnProps,
      ...props.defaults,
      ...props.overrides,
      functionName: serviceFunctionName(
        props.serviceName,
        props.functionNameSuffix
      ),
      handler: props.bundledFunction.handler ?? "index.default",
      code: props.build.getCode(props.bundledFunction.entry),
      memorySize:
        props.defaults?.memorySize ??
        props.overrides?.memorySize ??
        props.runtimeProps?.memorySize ??
        512,
      timeout:
        props.overrides?.timeout ??
        (props.runtimeProps?.handlerTimeout
          ? Duration.seconds(
              computeDurationSeconds(props.runtimeProps.handlerTimeout)
            )
          : props.defaults?.timeout ?? Duration.seconds(3)),
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        ...baseFnProps.environment,
        ...props.defaults?.environment,
        ...props.overrides?.environment,
      },
    });
  }
}

import { serviceFunctionName } from "@eventual/aws-runtime";
import { computeDurationSeconds } from "@eventual/core-runtime";
import { FunctionRuntimeProps } from "@eventual/core/src/function-props";
import { Duration } from "aws-cdk-lib";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { BuildOutput } from "./build";
import { BundledFunction } from "./build-manifest";
import { baseFnProps } from "./utils";

export interface ServiceFunctionProps {
  overrides?: Omit<Partial<FunctionProps>, "code" | "handler" | "functionName">;
  build: BuildOutput;
  bundledFunction: BundledFunction<any>;
  runtimeProps?: FunctionRuntimeProps;
  serviceName: string;
  functionNameSuffix: string;
  environment?: Record<string, string>;
}

export class ServiceFunction extends Function {
  constructor(scope: Construct, id: string, props: ServiceFunctionProps) {
    super(scope, id, {
      ...baseFnProps,
      ...props.overrides,
      functionName: serviceFunctionName(
        props.serviceName,
        props.functionNameSuffix
      ),
      memorySize:
        props.runtimeProps?.memorySize ?? props.overrides?.memorySize ?? 512,
      timeout: props.runtimeProps?.handlerTimeout
        ? Duration.seconds(
            computeDurationSeconds(props.runtimeProps.handlerTimeout)
          )
        : props.overrides?.timeout,
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        ...baseFnProps.environment,
        ...props.environment,
        ...props.overrides?.environment,
      },
      handler: props.bundledFunction.handler ?? "index.default",
      code: props.build.getCode(props.bundledFunction.file),
    });
  }
}

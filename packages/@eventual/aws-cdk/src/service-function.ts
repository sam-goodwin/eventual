import { ServiceType, SERVICE_TYPE_FLAG } from "@eventual/core";
import { Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  Function,
  FunctionProps,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { ENV_NAMES } from "../../aws-runtime/";
import { ITelemetryEnv } from "./telemetry";
import { outDir } from "./utils";

export interface ServiceFunctionProps
  extends Omit<FunctionProps, "code" | "handler" | "runtime"> {
  serviceType: ServiceType;
  handler?: string;
  runtime?: Runtime;
  telemetryEnv: ITelemetryEnv;
}

export class ServiceFunction extends Function {
  constructor(scope: Construct, id: string, props: ServiceFunctionProps) {
    super(scope, id, {
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      ...props,
      code: Code.fromAsset(outDir(scope, props.serviceType)),
      handler: props.handler ?? "index.default",
      environment: {
        ...props.environment,
        NODE_OPTIONS: "--enable-source-maps",
        [SERVICE_TYPE_FLAG]: props.serviceType,
        [ENV_NAMES.TELEMETRY_LOG_GROUP]: props.telemetryEnv.logGroupName,
        [ENV_NAMES.TELEMETRY_LOG_STREAM]: props.telemetryEnv.logStreamName,
      },
    });
  }
}

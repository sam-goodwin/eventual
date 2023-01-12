import { ServiceType } from "@eventual/core";
import {
  Architecture,
  Code,
  Function,
  FunctionProps,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { outDir } from "./utils";

export interface ServiceFunctionProps
  extends Omit<FunctionProps, "code" | "handler" | "runtime"> {
  serviceType: ServiceType;
  handler?: string;
  runtime?: Runtime;
}

export class ServiceFunction extends Function {
  constructor(scope: Construct, id: string, props: ServiceFunctionProps) {
    super(scope, id, {
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      ...props,
      code: Code.fromAsset(outDir(scope, props.serviceType)),
      handler: props.handler ?? "index.default",
      environment: {
        ...props.environment,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
  }
}

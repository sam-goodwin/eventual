import { ServiceType } from "@eventual/core";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { baseFnProps } from "./utils";

export interface ServiceFunctionProps
  extends Omit<FunctionProps, "handler" | "runtime"> {
  serviceType: ServiceType;
  handler?: string;
}

export class ServiceFunction extends Function {
  constructor(scope: Construct, id: string, props: ServiceFunctionProps) {
    super(scope, id, {
      ...baseFnProps,
      memorySize: 512,
      ...props,
      handler: props.handler ?? "index.default",
      environment: {
        ...props.environment,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
  }
}

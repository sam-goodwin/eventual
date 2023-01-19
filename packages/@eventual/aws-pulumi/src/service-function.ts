import { ServiceType } from "@eventual/core";
import type { Input, ResourceOptions } from "@pulumi/pulumi";
import { FileAsset } from "@pulumi/pulumi/asset";
import { Function, FunctionProps } from "./aws/function";
import { outDir } from "./utils";

export interface ServiceFunctionProps
  extends Omit<FunctionProps, "code" | "handler" | "runtime" | "environment"> {
  serviceType: ServiceType;
  handler?: string;
  runtime?: string;
  environment?: Record<string, Input<string>>;
}

export class ServiceFunction extends Function {
  readonly variables: Record<string, string>;
  constructor(
    id: string,
    props: ServiceFunctionProps,
    options: ResourceOptions
  ) {
    const variables = {
      ...props.environment,
      NODE_OPTIONS: "--enable-source-maps",
    };
    super(
      id,
      {
        runtime: "nodejs16.x",
        architectures: ["arm64"],
        memorySize: 512,
        ...props,
        code: outDir(options.parent!, props.serviceType).apply(
          (path) => new FileAsset(path)
        ),
        handler: props.handler ?? "index.default",
      },
      options
    );

    this.variables = variables;
  }
}

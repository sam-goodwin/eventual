import { execSync } from "child_process";

import { Construct } from "constructs";
import { aws_lambda } from "aws-cdk-lib";
import { Architecture, Code, Runtime } from "aws-cdk-lib/aws-lambda";
import path from "path";

export interface WorkflowProps {
  entry: string;
}

export class Workflow extends Construct {
  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    const outDir = path.join(".eventual", this.node.addr);

    execSync(
      `node ${require.resolve(
        "@eventual/compiler/lib/eventual-bundle.js"
      )} ${outDir} ${props.entry}`
    );

    new aws_lambda.Function(this, "Worker", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(outDir),
      handler: "index.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
    });
  }
}

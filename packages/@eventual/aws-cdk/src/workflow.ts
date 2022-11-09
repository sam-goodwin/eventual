import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface WorkflowProps {
  entry: string;
}

// placeholder
export class Workflow extends Construct {
  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);   

    new NodejsFunction(this, 'workflowFunction', {
        entry: props.entry,
        runtime: Runtime.NODEJS_16_X,
        architecture: Architecture.ARM_64,
        bundling: {
            mainFields: ['module', 'main']
        }
    })
  }
}

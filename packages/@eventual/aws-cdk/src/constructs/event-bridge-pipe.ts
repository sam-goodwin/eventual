import { CfnResource } from "aws-cdk-lib";
import {
  IGrantable,
  IPrincipal,
  IRole,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface EventBridgePipeProps {
  role?: IRole;
  source: string;
  target: string;
  sourceParameters: PipeSourceParameters;
  targetParameters: PipeTargetParameters;
}

/**
 * Note: this is an incomplete set of possible arguments for an sqs pipe target.
 */
export interface SqsQueuePipeTargetParameters {
  MessageGroupId: string;
}

export interface LambdaPipeTargetParameters {
  InvocationType: "REQUEST_RESPONSE" | "FIRE_AND_FORGET ";
}

/**
 * Note: this is an incomplete set of possible arguments for a pipe target.
 */
export interface PipeTargetParameters {
  SqsQueueParameters?: SqsQueuePipeTargetParameters;
  LambdaFunctionParameters?: LambdaPipeTargetParameters;
  InputTemplate?: string;
}

/**
 * Note: this is an incomplete et of possible arguments for a dynamo stream pipe source.
 */
export interface PipeDynamoDBStreamParameters {
  /**
   * when CREATE/REPLACING a pipe, it can take up to 1 minute to start polling for events.
   * TRIM_HORIZON will catch any events created during that one minute (and last 24 hours for existing streams)
   * The assumption is that it is unlikely that the pipe will be replaced on an active service
   * TODO: check in with the Event Bridge team to see LATEST will work without dropping events for new streams.
   */
  StartingPosition: "TRIM_HORIZON" | "LATEST";
  MaximumBatchingWindowInSeconds: number;
}

export interface PipeSourceParameters {
  DynamoDBStreamParameters: PipeDynamoDBStreamParameters;
  FilterCriteria?: { Filters: { Pattern: string }[] };
  [key: string]: any;
}

export class EventBridgePipe extends Construct implements IGrantable {
  public grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: EventBridgePipeProps) {
    super(scope, id);

    const pipeRole = new Role(scope, `Role`, {
      assumedBy: new ServicePrincipal("pipes"),
    });

    this.grantPrincipal = pipeRole;

    new CfnResource(scope, "Resource", {
      type: "AWS::Pipes::Pipe",
      properties: {
        RoleArn: pipeRole.roleArn,
        Source: props.source,
        SourceParameters: props.sourceParameters,
        Target: props.target,
        TargetParameters: props.targetParameters,
      },
    });
  }
}

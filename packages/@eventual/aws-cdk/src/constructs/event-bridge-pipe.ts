import { Resource } from "aws-cdk-lib/core";
import {
  IGrantable,
  IPrincipal,
  IRole,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnPipe, CfnPipeProps } from "aws-cdk-lib/aws-pipes";
import { Construct } from "constructs";

export interface EventBridgePipeProps extends Omit<CfnPipeProps, "roleArn"> {
  role?: IRole;
}

export type PipeSourceParameters = Exclude<
  CfnPipeProps["sourceParameters"],
  undefined
>;

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

export class EventBridgePipe extends Resource implements IGrantable {
  public grantPrincipal: IPrincipal;

  private readonly resource: CfnPipe;

  constructor(scope: Construct, id: string, props: EventBridgePipeProps) {
    super(scope, id);

    const pipeRole = new Role(scope, `Role`, {
      assumedBy: new ServicePrincipal("pipes"),
    });

    this.grantPrincipal = pipeRole;

    this.resource = new CfnPipe(scope, "Resource", {
      roleArn: pipeRole.roleArn,
      source: props.source,
      target: props.target,
      sourceParameters: props.sourceParameters,
      targetParameters: props.targetParameters,
    });
  }
}

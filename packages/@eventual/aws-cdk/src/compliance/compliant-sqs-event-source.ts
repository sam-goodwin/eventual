import { Names } from "aws-cdk-lib";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import {
  SqsEventSource,
  SqsEventSourceProps,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { attachPolicy } from "../attach-policy";

/**
 * Overrides the default {@link SqsEventSource} to attach a policy to the lambda function.
 *
 * This is required because HIPAA compliance requires no inline policies are used.
 */
export class CompliantSqsEventSource extends SqsEventSource {
  constructor(
    queue: IQueue,
    readonly policy: ManagedPolicy,
    readonly _props: SqsEventSourceProps
  ) {
    super(queue, _props);
  }
  public bind(target: IFunction) {
    // @ts-ignore - a private variable i need access
    const props = this.props as SqsEventSourceProps;
    const eventSourceMapping = target.addEventSourceMapping(
      `SqsEventSource:${Names.nodeUniqueId(this.queue.node)}`,
      {
        batchSize: this._props.batchSize,
        maxBatchingWindow: this._props.maxBatchingWindow,
        maxConcurrency: this._props.maxConcurrency,
        reportBatchItemFailures: this._props.reportBatchItemFailures,
        enabled: this._props.enabled,
        eventSourceArn: this.queue.queueArn,
        filters: this._props.filters,
      }
    );
    // @ts-ignore - a private variable i need access
    this._eventSourceMappingId = eventSourceMapping.eventSourceMappingId;
    // @ts-ignore - a private variable i need access
    this._eventSourceMappingArn = eventSourceMapping.eventSourceMappingArn;

    if (target.role) {
      attachPolicy(target.role, this.policy);
    }
  }
}

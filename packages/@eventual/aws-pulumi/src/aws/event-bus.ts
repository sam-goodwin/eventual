import { cloudwatch } from "@pulumi/aws";
import { ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export interface EventBusProps extends Omit<cloudwatch.EventBusArgs, "name"> {
  eventBusName: string;
}

export class EventBus extends cloudwatch.EventBus {
  constructor(name: string, props: EventBusProps, options?: ResourceOptions) {
    super(
      name,
      {
        ...props,
        name: props.eventBusName,
      },
      options
    );
  }

  public grantPutEventsTo(grantee: IGrantable): void {
    return grantee.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: this.arn,
    });
  }
}

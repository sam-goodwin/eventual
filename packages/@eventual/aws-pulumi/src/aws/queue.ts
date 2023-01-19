import { sqs } from "@pulumi/aws";
import { ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export class Queue extends sqs.Queue {
  public readonly queueArn;
  public readonly queueUrl;
  constructor(name: string, args: sqs.QueueArgs, opts?: ResourceOptions) {
    super(name, args, opts);
    this.queueArn = this.arn;
    this.queueUrl = this.url;
  }

  public grantSendMessages(grantable: IGrantable): void {
    grantable.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: ["sqs:SendMessage", "sqs:SendMessageBatch"],
      Resource: this.arn,
    });
  }
}

import { dynamodb } from "@pulumi/aws";
import { Output, ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export class Table extends dynamodb.Table {
  public readonly tableName: Output<string>;

  constructor(
    name: string,
    props: dynamodb.TableArgs,
    options?: ResourceOptions
  ) {
    super(name, props, options);
    this.tableName = this.name;
  }

  private grant(to: IGrantable, actions: string[]) {
    to.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: actions,
      Resource: this.arn,
    });
  }

  public grantReadData(to: IGrantable): void {
    this.grant(to, readActions);
  }

  public grantWriteData(to: IGrantable): void {
    this.grant(to, writeActions);
  }

  public grantReadWriteData(to: IGrantable): void {
    this.grant(to, [...readActions, ...writeActions]);
  }
}

const readActions = [
  "dynamodb:BatchGetItem",
  "dynamodb:TransactGetItems",
  "dynamodb:GetItem",
  "dynamodb:Query",
  "dynamodb:Scan",
];

const writeActions = [
  "dynamodb:BatchWriteItem",
  "dynamodb:TransactWriteItems",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
];

import { Service } from "@eventual/aws-cdk";
import { aws_dynamodb, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ReservationsStackProps extends StackProps {
  stage: "dev" | "prod";
}

export class ReservationsStack extends Stack {
  readonly service: Service;
  readonly table: aws_dynamodb.Table;

  constructor(scope: Construct, id: string, props: ReservationsStackProps) {
    super(scope, id, props);

    this.table = new aws_dynamodb.Table(this, "Table", {
      partitionKey: {
        name: "pk",
        type: aws_dynamodb.AttributeType.STRING,
      },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    this.service = new Service(this, "Service", {
      name: `reservations-${props.stage}`,
      entry: require.resolve("@example/airline/lib/reservations/service.js"),
      environment: {
        TABLE_NAME: this.table.tableArn,
      },
    });

    this.table.grantReadWriteData(this.service);
  }
}

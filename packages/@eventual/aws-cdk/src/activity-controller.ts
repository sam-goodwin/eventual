import { ENV_NAMES } from "@eventual/aws-runtime";
import { RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { addEnvironment } from "./utils";
import { WorkflowController } from "./workflow-controller";

export interface ActivityControllerProps {
  workflowController: WorkflowController;
}

export class ActivityController extends Construct {
  public activitiesTable: ITable;
  constructor(
    scope: Construct,
    id: string,
    private props: ActivityControllerProps
  ) {
    super(scope, id);

    this.activitiesTable = new Table(this, "Locks", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  configureActivityControl(func: Function) {
    this.props.workflowController.configureWorkflowControl(func);
    this.grantControlActivity(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_TABLE_NAME]: this.activitiesTable.tableName,
    });
  }

  grantControlActivity(grantable: IGrantable) {
    this.activitiesTable.grantReadWriteData(grantable);
  }
}

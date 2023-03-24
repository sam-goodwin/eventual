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
import { ServiceConstructProps } from "./service";

export interface EntityServiceProps extends ServiceConstructProps {}

export class EntityService {
  public table: ITable;

  constructor(props: EntityServiceProps) {
    const entitiesConstruct = new Construct(props.serviceScope, "Entities");
    this.table = new Table(entitiesConstruct, "Table", {
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  public configureReadWriteEntityTable(func: Function) {
    this.addEnvs(func, ENV_NAMES.ENTITY_TABLE_NAME);
    this.grantReadWriteEntityTable(func);
  }

  public grantReadWriteEntityTable(grantee: IGrantable) {
    this.table.grantReadWriteData(grantee);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.ENTITY_TABLE_NAME]: () => this.table.tableName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

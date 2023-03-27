import { ENV_NAMES } from "@eventual/aws-runtime";
import { DictionaryStreamFunction } from "@eventual/core-runtime";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { EventBridgePipe } from "./constructs/event-bridge-pipe";
import { ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";

export interface EntityServiceProps extends ServiceConstructProps {}

export class EntityService {
  public table: ITable;
  public dictionaryStreams: Record<string, DictionaryStreamFunction>;

  constructor(props: EntityServiceProps) {
    const entitiesConstruct = new Construct(props.serviceScope, "Entities");

    const streams = props.build.entities.dictionaries.flatMap((d) => d.streams);

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
      // only include the stream if there are listeners
      stream:
        streams.length > 0
          ? streams.some((s) => s.spec.options?.includeOld)
            ? StreamViewType.NEW_AND_OLD_IMAGES
            : StreamViewType.NEW_IMAGE
          : undefined,
    });

    const dictionaryStreamsScope = new Construct(
      entitiesConstruct,
      "DictionaryStreams"
    );

    streams.map((s) => {
      const handler = new ServiceFunction(dictionaryStreamsScope, "Handler", {
        build: props.build,
        bundledFunction: s,
        functionNameSuffix: `${s.spec.name}-dictionary-stream`,
        serviceName: props.serviceName,
        defaults: {
          timeout: Duration.minutes(1),
          environment: props.environment,
        },
        runtimeProps: s.spec.options,
        overrides: {
          environment: props.environment,
        },
      });

      // let the handler worker use the service client.
      props.service.configureForServiceClient(handler);

      const pipe = new EventBridgePipe(dictionaryStreamsScope, "Pipe", {
        source: this.table.tableStreamArn!,
        sourceParameters: {
          DynamoDBStreamParameters: {
            // should this be customizable?
            MaximumBatchingWindowInSeconds: 1,
            StartingPosition: "TRIM_HORIZON",
          },
          FilterCriteria: {
            Filters: [
              {
                Pattern: JSON.stringify({
                  ...(s.spec.options?.operations
                    ? { eventName: s.spec.options?.operations }
                    : undefined),
                  dynamodb: {
                    NewImage: {
                      pk: {
                        S: [`DictEntry$${s.spec.dictionaryName}`],
                      },
                    },
                  },
                }),
              },
            ],
          },
        },
        target: handler.functionArn,
        targetParameters: {
          LambdaFunctionParameters: {
            InvocationType: "REQUEST_RESPONSE",
          },
        },
      });
      handler.grantInvoke(pipe);
      this.table.grantStreamRead(pipe);
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

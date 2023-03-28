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
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { EventBridgePipe } from "./constructs/event-bridge-pipe";
import { EventualResource, ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";

export interface EntityServiceProps extends ServiceConstructProps {}

export class EntityService {
  public table: ITable;
  public dictionaryStreams: Record<string, DictionaryStream>;

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

    this.dictionaryStreams = Object.fromEntries(
      streams.map((s) => {
        return [
          s.spec.name,
          new DictionaryStream(dictionaryStreamsScope, s.spec.name, {
            serviceProps: props,
            stream: s,
            table: this.table,
          }),
        ];
      })
    );
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

interface DictionaryStreamProps {
  table: ITable;
  serviceProps: ServiceConstructProps;
  stream: DictionaryStreamFunction;
}

export class DictionaryStream extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(scope: Construct, id: string, props: DictionaryStreamProps) {
    super(scope, id);
    this.handler = new ServiceFunction(this, "Handler", {
      build: props.serviceProps.build,
      bundledFunction: props.stream,
      functionNameSuffix: `${props.stream.spec.name}-dictionary-stream`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: props.serviceProps.environment,
      },
      runtimeProps: props.stream.spec.options,
      overrides: {
        environment: props.serviceProps.environment,
      },
    });

    // let the handler worker use the service client.
    props.serviceProps.service.configureForServiceClient(this.handler);

    const namespaces = props.stream.spec.options?.namespaces;
    const namespacePrefixes = props.stream.spec.options?.namespacePrefixes;

    const pipe = new EventBridgePipe(this, "Pipe", {
      source: props.table.tableStreamArn!,
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
                ...(props.stream.spec.options?.operations
                  ? { eventName: props.stream.spec.options?.operations }
                  : undefined),
                dynamodb: {
                  NewImage: {
                    pk: {
                      S:
                        (!namespaces || namespaces.length === 0) &&
                        (!namespacePrefixes || namespacePrefixes.length === 0)
                          ? // if no namespaces are given, match the name only, aka, the prefix of the pk
                            [
                              {
                                prefix: `DictEntry$${props.stream.spec.dictionaryName}$`,
                              },
                            ]
                          : [
                              // for each namespace given, match the complete name.
                              ...(namespaces
                                ? namespaces.map(
                                    (n) =>
                                      `DictEntry$${props.stream.spec.dictionaryName}$${n}`
                                  )
                                : []),
                              // for each namespace prefix given, build a prefix statement for each one.
                              ...(namespacePrefixes
                                ? namespacePrefixes.map((n) => ({
                                    prefix: `DictEntry$${props.stream.spec.dictionaryName}$${n}`,
                                  }))
                                : []),
                            ],
                    },
                  },
                },
              }),
            },
          ],
        },
      },
      target: this.handler.functionArn,
      targetParameters: {
        LambdaFunctionParameters: {
          InvocationType: "REQUEST_RESPONSE",
        },
      },
    });
    this.handler.grantInvoke(pipe);
    props.table.grantStreamRead(pipe);

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}

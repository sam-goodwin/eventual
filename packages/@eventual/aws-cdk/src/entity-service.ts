import {
  DictionaryEntityRecord,
  entityServiceTableSuffix,
  ENV_NAMES,
  serviceFunctionName,
} from "@eventual/aws-runtime";
import {
  DictionaryRuntime,
  DictionaryStreamFunction,
} from "@eventual/core-runtime";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable, IPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  FilterCriteria,
  FilterRule,
  Function,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import { CommandService } from "./command-service";
import { LazyInterface } from "./proxy-construct";
import { EventualResource, ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";
import { serviceTableArn } from "./utils";

export interface EntityServiceProps extends ServiceConstructProps {
  commandService: LazyInterface<CommandService>;
}

export class EntityService {
  public dictionaries: Record<string, Dictionary>;

  constructor(private props: EntityServiceProps) {
    const entitiesConstruct = new Construct(props.serviceScope, "Entities");

    this.dictionaries = Object.fromEntries(
      props.build.entities.dictionaries.map((d) => [
        d.name,
        new Dictionary(entitiesConstruct, {
          dictionary: d,
          entityService: this,
          serviceProps: props,
        }),
      ])
    );
  }

  public configureReadWriteEntityTable(func: Function) {
    /**
     * Service name is used to compute the entity table names
     */
    this.addEnvs(func, ENV_NAMES.SERVICE_NAME);
    this.grantReadWriteEntityTables(func);
  }

  public grantReadWriteEntityTables(grantee: IGrantable) {
    // grants the permission to start any activity
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          "dynamodb:Query",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeTable",
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
          "dynamodb:ConditionCheckItem",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:UpdateItem",
          "dynamodb:PutItem",
          "dynamodb:GetRecords",
          "dynamodb:GetItem",
        ],
        resources: [
          serviceTableArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            entityServiceTableSuffix("*"),
            false
          ),
        ],
      })
    );
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_NAME]: () => this.props.serviceName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface DictionaryProps {
  serviceProps: EntityServiceProps;
  entityService: EntityService;
  dictionary: DictionaryRuntime;
}

interface DictionaryStreamProps {
  table: ITable;
  serviceProps: EntityServiceProps;
  entityService: EntityService;
  stream: DictionaryStreamFunction;
}

export class Dictionary extends Construct {
  public table: ITable;
  public streams: Record<string, DictionaryStream>;

  constructor(scope: Construct, props: DictionaryProps) {
    super(scope, props.dictionary.name);

    this.table = new Table(this, "Table", {
      tableName: serviceFunctionName(
        props.serviceProps.serviceName,
        entityServiceTableSuffix(props.dictionary.name)
      ),
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
        props.dictionary.streams.length > 0
          ? props.dictionary.streams.some((s) => s.spec.options?.includeOld)
            ? StreamViewType.NEW_AND_OLD_IMAGES
            : StreamViewType.NEW_IMAGE
          : undefined,
    });

    const dictionaryStreamScope = new Construct(scope, "DictionaryStreams");

    this.streams = Object.fromEntries(
      props.dictionary.streams.map((s) => [
        s.spec.name,
        new DictionaryStream(dictionaryStreamScope, s.spec.name, {
          entityService: props.entityService,
          serviceProps: props.serviceProps,
          stream: s,
          table: this.table,
        }),
      ])
    );
  }
}

export class DictionaryStream extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(scope: Construct, id: string, props: DictionaryStreamProps) {
    super(scope, id);

    const namespaces = props.stream.spec.options?.namespaces;
    const namespacePrefixes = props.stream.spec.options?.namespacePrefixes;

    const filters = {
      ...(props.stream.spec.options?.operations
        ? {
            eventName: FilterRule.or(
              ...props.stream.spec.options?.operations.map((op) =>
                op.toUpperCase()
              )
            ),
          }
        : undefined),
      ...((namespaces && namespaces.length > 0) ||
      (namespacePrefixes && namespacePrefixes.length > 0)
        ? {
            dynamodb: {
              Keys: {
                pk: {
                  S: FilterRule.or(
                    // for each namespace given, match the complete name.
                    ...(namespaces
                      ? namespaces.map((n) => DictionaryEntityRecord.key(n))
                      : []),
                    // for each namespace prefix given, build a prefix statement for each one.
                    ...(namespacePrefixes
                      ? namespacePrefixes.flatMap(
                          (n) =>
                            FilterRule.beginsWith(
                              DictionaryEntityRecord.key(n)
                            ) as unknown as string[]
                        )
                      : [])
                  ),
                },
              },
            },
          }
        : undefined),
    };

    this.handler = new ServiceFunction(this, "Handler", {
      build: props.serviceProps.build,
      bundledFunction: props.stream,
      functionNameSuffix: `dictionary-stream-${props.stream.spec.dictionaryName}-${props.stream.spec.name}`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.DICTIONARY_NAME]: props.stream.spec.dictionaryName,
          [ENV_NAMES.DICTIONARY_STREAM_NAME]: props.stream.spec.name,
          ...props.serviceProps.environment,
        },
        events: [
          new DynamoEventSource(props.table, {
            startingPosition: StartingPosition.TRIM_HORIZON,
            maxBatchingWindow: Duration.seconds(0),
            ...(Object.keys(filters).length > 0
              ? { filters: [FilterCriteria.filter(filters)] }
              : {}),
          }),
        ],
      },
      runtimeProps: props.stream.spec.options,
      overrides: {
        environment: props.serviceProps.environment,
      },
    });

    // let the handler worker use the service client.
    props.serviceProps.commandService.configureInvokeHttpServiceApi(
      this.handler
    );
    props.entityService.configureReadWriteEntityTable(this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}

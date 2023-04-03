import {
  EntityEntityRecord,
  entityServiceTableSuffix,
  ENV_NAMES,
  serviceFunctionName,
} from "@eventual/aws-runtime";
import { EntityRuntime, EntityStreamFunction } from "@eventual/core-runtime";
import { TransactionSpec } from "@eventual/core/internal";
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
  FunctionProps,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import { CommandService } from "./command-service";
import { EventService } from "./event-service.js";
import { LazyInterface } from "./proxy-construct";
import { EventualResource, ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";
import { ServiceEntityProps, serviceTableArn } from "./utils";
import { WorkflowService } from "./workflow-service.js";

export type ServiceEntities<Service> = ServiceEntityProps<
  Service,
  "Entity",
  Entity
>;

export type ServiceTransactions<Service> = ServiceEntityProps<
  Service,
  "Transaction",
  TransactionSpec
>;

export type ServiceEntityStreams<Service> = ServiceEntityProps<
  Service,
  "EntityStream",
  EntityStream
>;

export type EntityStreamOverrides<Service> = Partial<
  ServiceEntityProps<Service, "EntityStream", EntityStreamHandlerProps>
>;

export interface EntityStreamHandlerProps
  extends Omit<
    Partial<FunctionProps>,
    "code" | "handler" | "functionName" | "events"
  > {}

export interface EntityServiceProps<Service> extends ServiceConstructProps {
  commandService: LazyInterface<CommandService<Service>>;
  eventService: LazyInterface<EventService>;
  workflowService: LazyInterface<WorkflowService>;
  entityStreamOverrides?: EntityStreamOverrides<Service>;
  entityServiceOverrides?: {
    transactionWorkerOverrides?: Omit<
      Partial<FunctionProps>,
      "code" | "handler" | "functionName"
    >;
  };
}

export class EntityService<Service> {
  public entities: ServiceEntities<Service>;
  public entityStreams: ServiceEntityStreams<Service>;
  public transactions: ServiceTransactions<Service>;
  public transactionWorker?: Function;

  constructor(private props: EntityServiceProps<Service>) {
    const entitiesConstruct = new Construct(props.serviceScope, "Entities");
    const entityServiceConstruct = new Construct(
      props.systemScope,
      "EntityService"
    );

    this.entities = Object.fromEntries(
      props.build.entities.entities.map((d) => [
        d.name,
        new Entity(entitiesConstruct, {
          entity: d,
          entityService: this,
          serviceProps: props,
        }),
      ])
    ) as ServiceEntities<Service>;

    this.entityStreams = Object.values(
      this.entities as Record<string, Entity>
    ).reduce((streams: Record<string, EntityStream>, ent) => {
      return {
        ...streams,
        ...ent.streams,
      };
    }, {}) as ServiceEntityStreams<Service>;

    this.transactions = Object.fromEntries(
      props.build.entities.transactions.map((t) => [t.name, t])
    ) as ServiceTransactions<Service>;

    if (props.build.entities.transactions.length > 0) {
      this.transactionWorker = new ServiceFunction(
        entityServiceConstruct,
        "TransactionWorker",
        {
          build: props.build,
          bundledFunction: props.build.system.entityService.transactionWorker,
          functionNameSuffix: "transaction-worker",
          serviceName: props.serviceName,
          defaults: {
            timeout: Duration.seconds(30),
          },
          overrides: props.entityServiceOverrides?.transactionWorkerOverrides,
        }
      );
      this.configureReadWriteEntityTable(this.transactionWorker);
      props.workflowService.configureSendSignal(this.transactionWorker);
      props.eventService.configurePublish(this.transactionWorker);
    }
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

  public configureInvokeTransactions(func: Function) {
    this.addEnvs(func, ENV_NAMES.TRANSACTION_WORKER_ARN);
    this.grantInvokeTransactions(func);
  }

  public grantInvokeTransactions(grantee: IGrantable) {
    this.transactionWorker?.grantInvoke(grantee);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_NAME]: () => this.props.serviceName,
    [ENV_NAMES.TRANSACTION_WORKER_ARN]: () =>
      this.transactionWorker?.functionArn ?? "",
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface EntityProps {
  serviceProps: EntityServiceProps<any>;
  entityService: EntityService<any>;
  entity: EntityRuntime;
}

interface EntityStreamProps {
  table: ITable;
  serviceProps: EntityServiceProps<any>;
  entityService: EntityService<any>;
  stream: EntityStreamFunction;
}

export class Entity extends Construct {
  public table: ITable;
  public streams: Record<string, EntityStream>;

  constructor(scope: Construct, props: EntityProps) {
    super(scope, props.entity.name);

    this.table = new Table(this, "Table", {
      tableName: serviceFunctionName(
        props.serviceProps.serviceName,
        entityServiceTableSuffix(props.entity.name)
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
        props.entity.streams.length > 0
          ? props.entity.streams.some((s) => s.spec.options?.includeOld)
            ? StreamViewType.NEW_AND_OLD_IMAGES
            : StreamViewType.NEW_IMAGE
          : undefined,
    });

    const entityStreamScope = new Construct(this, "EntityStreams");

    this.streams = Object.fromEntries(
      props.entity.streams.map((s) => [
        s.spec.name,
        new EntityStream(entityStreamScope, s.spec.name, {
          entityService: props.entityService,
          serviceProps: props.serviceProps,
          stream: s,
          table: this.table,
        }),
      ])
    );
  }
}

export class EntityStream extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(scope: Construct, id: string, props: EntityStreamProps) {
    super(scope, id);

    const namespaces = props.stream.spec.options?.namespaces;
    const namespacePrefixes = props.stream.spec.options?.namespacePrefixes;
    const streamName = props.stream.spec.name;
    const entityName = props.stream.spec.entityName;

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
                      ? namespaces.map((n) => EntityEntityRecord.key(n))
                      : []),
                    // for each namespace prefix given, build a prefix statement for each one.
                    ...(namespacePrefixes
                      ? namespacePrefixes.flatMap(
                          (n) =>
                            FilterRule.beginsWith(
                              EntityEntityRecord.key(n)
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
      functionNameSuffix: `entity-stream-${entityName}-${streamName}`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.ENTITY_NAME]: entityName,
          [ENV_NAMES.ENTITY_STREAM_NAME]: streamName,
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
      overrides: props.serviceProps.entityStreamOverrides?.[streamName],
    });

    // let the handler worker use the service client.
    props.serviceProps.commandService.configureInvokeHttpServiceApi(
      this.handler
    );
    props.entityService.configureReadWriteEntityTable(this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}

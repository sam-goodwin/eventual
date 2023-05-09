import {
  entityServiceTableName,
  entityServiceTableSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import {
  EntityRuntime,
  EntityStreamFunction,
  normalizeCompositeKeyFromKeyDefinition,
  NormalizedEntityKeyDefinitionPart,
  normalizeEntitySpecKeyDefinition,
} from "@eventual/core-runtime";
import {
  assertNever,
  EntitySpec,
  TransactionSpec,
} from "@eventual/core/internal";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  Attribute,
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
import { BucketService } from "./bucket-service";
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

export type EntityStreamHandlerProps = Omit<
  Partial<FunctionProps>,
  "code" | "handler" | "functionName" | "events"
>;

export interface EntityServiceProps<Service> extends ServiceConstructProps {
  bucketService: LazyInterface<BucketService<Service>>;
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
      props.eventService.configureEmit(this.transactionWorker);
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
    // grants the permission to start any task
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
  entity: EntityRuntime;
  stream: EntityStreamFunction;
}

class Entity extends Construct {
  public table: ITable;
  public streams: Record<string, EntityStream>;

  constructor(scope: Construct, props: EntityProps) {
    super(scope, props.entity.name);

    const normalizedKeyDefinition = normalizeEntitySpecKeyDefinition(
      props.entity as unknown as EntitySpec
    );

    this.table = new Table(this, "Table", {
      tableName: entityServiceTableName(
        props.serviceProps.serviceName,
        props.entity.name
      ),
      partitionKey: entityKeyDefinitionToAttribute(
        normalizedKeyDefinition.partition
      ),
      sortKey: normalizedKeyDefinition.sort
        ? entityKeyDefinitionToAttribute(normalizedKeyDefinition.sort)
        : undefined,
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
          entity: props.entity,
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

    const streamName = props.stream.spec.name;
    const entityName = props.stream.spec.entityName;

    const normalizedKeyDefinition = normalizeEntitySpecKeyDefinition(
      props.entity as unknown as EntitySpec
    );
    const normalizedQueryKeys =
      props.stream.spec.options?.queryKeys?.map((q) =>
        normalizeCompositeKeyFromKeyDefinition(normalizedKeyDefinition, q)
      ) ?? [];

    const queryPatterns = normalizedQueryKeys.map((k) => {
      return {
        // if no part of the partition key is provided, do not include it
        partition:
          k.partition.keyValue !== undefined
            ? k.partition.partialValue
              ? FilterRule.beginsWith(k.partition.keyValue.toString())
              : k.partition.keyValue
            : undefined,
        sort:
          k.sort && k.sort.keyValue !== undefined
            ? k.sort?.partialValue
              ? FilterRule.beginsWith(k.sort.keyValue.toString())
              : k.sort.keyValue
            : undefined,
      };
    });

    const filters = {
      ...(props.stream.spec.options?.operations
        ? {
            eventName: FilterRule.or(
              ...(props.stream.spec.options?.operations?.map((op) =>
                op.toUpperCase()
              ) ?? [])
            ),
          }
        : undefined),
      ...(queryPatterns.length > 0
        ? {
            dynamodb: {
              Keys: {
                // https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns-content-based-filtering.html#eb-filtering-complex-example-or
                $or: queryPatterns.map(keyMatcher),
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

    props.serviceProps.bucketService.configureReadWriteBuckets(this.handler);
    props.entityService.configureReadWriteEntityTable(this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;

    function keyMatcher(item: (typeof queryPatterns)[number]) {
      return {
        ...(item.partition
          ? {
              [normalizedKeyDefinition.partition.keyAttribute]: {
                [keyTypeToAttributeType(normalizedKeyDefinition.partition)]: [
                  item.partition,
                ].flat(),
              },
            }
          : {}),
        ...(normalizedKeyDefinition.sort && item.sort
          ? {
              [normalizedKeyDefinition.sort.keyAttribute]: {
                [keyTypeToAttributeType(normalizedKeyDefinition.sort)]: [
                  item.sort,
                ].flat(),
              },
            }
          : {}),
      };

      function keyTypeToAttributeType(
        keyDef: NormalizedEntityKeyDefinitionPart
      ) {
        return keyDef.type === "number"
          ? "N"
          : keyDef.type === "string"
          ? "S"
          : assertNever(keyDef.type);
      }
    }
  }
}

export function entityKeyDefinitionToAttribute(
  part: NormalizedEntityKeyDefinitionPart
): Attribute {
  return {
    name: part.keyAttribute,
    type:
      part.type === "string"
        ? AttributeType.STRING
        : part.type === "number"
        ? AttributeType.NUMBER
        : assertNever(part.type),
  };
}

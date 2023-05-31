import {
  entityServiceTableName,
  entityServiceTableSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import {
  EntityRuntime,
  EntityStreamFunction,
  normalizeCompositeKey,
} from "@eventual/core-runtime";
import {
  assertNever,
  KeyDefinitionPart,
  TransactionSpec,
} from "@eventual/core/internal";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib/core";
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
import { SearchService } from "./search/search-service";

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
  searchService: SearchService<Service> | undefined;
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
          searchService: props.searchService,
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
  searchService: SearchService<any> | undefined;
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

    const keyDefinition = props.entity.key;

    const table = (this.table = new Table(this, "Table", {
      tableName: entityServiceTableName(
        props.serviceProps.serviceName,
        props.entity.name
      ),
      partitionKey: entityKeyDefinitionToAttribute(keyDefinition.partition),
      sortKey: keyDefinition.sort
        ? entityKeyDefinitionToAttribute(keyDefinition.sort)
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
    }));

    props.entity.indices.forEach((i) => {
      // LSI may not be used with a table that doesn't already have a sort key, but GSI can
      if (i.partition || !keyDefinition.sort) {
        table.addGlobalSecondaryIndex({
          indexName: i.name,
          partitionKey: entityKeyDefinitionToAttribute(i.key.partition),
          sortKey: i.key.sort
            ? entityKeyDefinitionToAttribute(i.key.sort)
            : undefined,
        });
      } else if (i.key.sort) {
        table.addLocalSecondaryIndex({
          indexName: i.name,
          sortKey: entityKeyDefinitionToAttribute(i.key.sort),
        });
      }
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

    const keyDefinition = props.entity.key;

    const normalizedQueryKeys =
      props.stream.spec.options?.queryKeys?.map((q) =>
        normalizeCompositeKey(keyDefinition, q)
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

    const eventNameFilter = props.stream.spec.options?.operations
      ? {
          eventName: FilterRule.or(
            ...(props.stream.spec.options?.operations?.map((op) =>
              op.toUpperCase()
            ) ?? [])
          ),
        }
      : undefined;

    // create a filter expression for each combination of key filter when present
    // Would prefer to use $or within a single expression, but it seems it doesn't work with event source maps (yet?)
    // TODO: can reduce the number of unique expressions by merging single field key queries togethers (all partition or all sort)
    const filters =
      !eventNameFilter && queryPatterns.length === 0
        ? []
        : eventNameFilter && queryPatterns.length === 0
        ? [FilterCriteria.filter(eventNameFilter)]
        : queryPatterns.map((q) =>
            FilterCriteria.filter({
              ...eventNameFilter,
              dynamodb: {
                Keys: keyMatcher(q),
              },
            })
          );

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
            ...(filters.length > 0 ? { filters } : {}),
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
    props.serviceProps.searchService?.configureSearch(this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;

    function keyMatcher(item: (typeof queryPatterns)[number]) {
      return {
        ...(item.partition
          ? {
              [keyDefinition.partition.keyAttribute]: {
                [keyTypeToAttributeType(keyDefinition.partition)]: [
                  item.partition,
                ].flat(),
              },
            }
          : {}),
        ...(keyDefinition.sort && item.sort
          ? {
              [keyDefinition.sort.keyAttribute]: {
                [keyTypeToAttributeType(keyDefinition.sort)]: [
                  item.sort,
                ].flat(),
              },
            }
          : {}),
      };

      function keyTypeToAttributeType(keyDef: KeyDefinitionPart) {
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
  part: KeyDefinitionPart
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

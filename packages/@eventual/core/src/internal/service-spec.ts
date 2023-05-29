import type openapi from "openapi3-ts";
import { Attributes } from "../entity/entity.js";
import {
  CompositeKeyPart,
  EntityCompositeKeyPart,
  StreamQueryKey,
} from "../entity/key.js";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import type { RestParams } from "../http/command.js";
import type { DurationSchedule } from "../schedule.js";
import type {
  SubscriptionFilter,
  SubscriptionRuntimeProps,
} from "../subscription.js";
import { KeyDefinition } from "./entity.js";
import type { TaskSpec } from "./task.js";

/**
 * Specification for an Eventual application
 */
export interface ServiceSpec {
  /**
   * List of workflows
   */
  workflows: WorkflowSpec[];
  transactions: TransactionSpec[];
  tasks: TaskSpec[];
  commands: CommandSpec<any, any, any, any>[];
  /**
   * Open API 3 schema definitions for all known Events in this Service.
   */
  events: EventSpec[];
  /**
   * Individually bundled {@link EventFunction}s containing a single `subscription` event handler.
   */
  subscriptions: SubscriptionSpec[];
  buckets: {
    buckets: BucketSpec[];
  };
  entities: {
    entities: EntitySpec[];
  };
  openApi: {
    info: openapi.InfoObject;
  };
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export interface SubscriptionSpec<Name extends string = string> {
  /**
   * Unique name of this Subscription.
   */
  name: Name;
  /**
   * Subscriptions this Event Handler is subscribed to. Any event flowing
   * through the Service's Event Bus that match these criteria will be
   * sent to this Lambda Function.
   */
  filters: SubscriptionFilter[];
  /**
   * Runtime configuration for this Event Handler.
   */
  props?: SubscriptionRuntimeProps;
  /**
   * Only available during eventual-infer.
   */
  sourceLocation?: SourceLocation;
}

export interface EventSpec {
  /**
   * The Event's globally unique name.
   */
  readonly name: string;
  /**
   * An optional Schema of the Event.
   */
  schema?: openapi.SchemaObject;
}

export interface CommandOutput {
  schema?: openapi.SchemaObject;
  description: string;
  /**
   * Status code of the output used in commands with a rest path.
   *
   * RPC commands always return a single 200 response.
   */
  restStatusCode: number;
}

export interface CommandSpec<
  Name extends string = string,
  Input = undefined,
  Path extends string | undefined = undefined,
  Method extends HttpMethod | undefined = undefined
> extends FunctionRuntimeProps {
  name: Name;
  /**
   * Long description of the API, written to the description field of the generated open API spec.
   */
  description?: string;
  /**
   * Short description of the API, written to the summary field of the generated open API spec.
   */
  summary?: string;
  input?: openapi.SchemaObject;
  /**
   * Output used by RPC commands and Rest commands to define the output of the handler.
   *
   * RPC will always have a status code of 200, but can override the default description of "OK".
   *
   * The REST command will return a 200 response unless an alternative is provided.
   */
  output?: CommandOutput;
  /**
   * Optional outputs provided by an http API command using passthrough mode.
   *
   * These commands return a {@link HttpResponse} which can define any number of outputs with custom status codes.
   *
   * The outputs are used to generate the {@link ApiSpecification}.
   */
  outputs?: CommandOutput[];
  path?: Path;
  method?: Method;
  params?: RestParams<Input, Path, Method>;
  sourceLocation?: SourceLocation;
  passThrough?: boolean;
  /**
   * Used to isolate rpc paths.
   *
   * /rpc[/namespace]/command
   */
  namespace?: string;
  /**
   * Enable or disable schema validation.
   *
   * @default true
   */
  validate?: boolean;
}

export function isSourceLocation(a: any): a is SourceLocation {
  return (
    a &&
    typeof a === "object" &&
    typeof a.fileName === "string" &&
    typeof a.exportName === "string"
  );
}

export interface SourceLocation {
  fileName: string;
  exportName: string;
}

export interface Schemas {
  [schemaName: string]: openapi.SchemaObject;
}

export interface WorkflowSpec<Name extends string = string> {
  /**
   * Globally unique ID of this {@link Workflow}.
   */
  name: Name;
}

export interface BucketSpec<Name extends string = string> {
  name: Name;
  handlers: BucketNotificationHandlerSpec[];
}

export type BucketNotificationEventType = "put" | "copy" | "delete";

export interface BucketNotificationHandlerOptions extends FunctionRuntimeProps {
  /**
   * A list of operations to be send to the stream.
   *
   * @default All Operations
   */
  eventTypes?: BucketNotificationEventType[];
  /**
   * Filter objects in the stream by prefix or suffix.
   */
  filters?: { prefix?: string; suffix?: string }[];
}

export interface BucketNotificationHandlerSpec<Name extends string = string> {
  name: Name;
  bucketName: string;
  options?: BucketNotificationHandlerOptions;
  sourceLocation?: SourceLocation;
}

export interface EntitySpec<Name extends string = string> {
  name: Name;
  key: KeyDefinition;
  /**
   * An Optional schema for the entity within an entity.
   */
  attributes: openapi.SchemaObject;
  streams: EntityStreamSpec[];
  indices: EntityIndexSpec[];
}

export type EntityStreamOperation = "insert" | "modify" | "remove";

export interface EntityStreamOptions<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  Operations extends EntityStreamOperation[] = EntityStreamOperation[]
> extends FunctionRuntimeProps {
  /**
   * A list of operations to be send to the stream.
   *
   * @default All Operations
   */
  operations?: Operations;
  /**
   * When true, the old value will be sent with the new value.
   */
  includeOld?: boolean;
  /**
   * One or more key queries that will be included in the stream.
   */
  queryKeys?: StreamQueryKey<Attr, Partition, Sort>[];
}

export interface EntityStreamSpec<
  Name extends string = string,
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> {
  name: Name;
  entityName: string;
  options?: EntityStreamOptions<Attr, Partition, Sort>;
  sourceLocation?: SourceLocation;
}

export interface EntityIndexSpec<Name extends string = string> {
  name: Name;
  entityName: string;
  key: KeyDefinition;
  partition?: CompositeKeyPart<any>;
  sort?: CompositeKeyPart<any>;
}

export interface TransactionSpec<Name extends string = string> {
  name: Name;
}

export interface EnvironmentManifest {
  serviceName: string;
  serviceSpec: ServiceSpec;
  serviceUrl: string;
}

import { ENV_NAMES } from "@eventual/aws-runtime";
import { Schemas } from "@eventual/core/internal";
import { aws_eventschemas, Lazy, Resource, Stack } from "aws-cdk-lib";
import { EventBus, IEventBus } from "aws-cdk-lib/aws-events";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import type { OpenAPIObject, SchemaObject } from "openapi3-ts";
import { grant } from "./grant";
import { ServiceConstructProps } from "./service";

export interface EventsProps extends ServiceConstructProps {}

export class EventService {
  /**
   * The {@link EventBus} containing all events flowing into and out of this {@link Service}.
   */
  public readonly bus: IEventBus;

  constructor(private props: EventsProps) {
    this.bus = new EventBus(props.serviceScope, "Bus", {
      eventBusName: props.serviceName,
    });
  }

  public configurePublish(func: Function) {
    this.grantPublish(func);
    this.addEnvs(func, ENV_NAMES.EVENT_BUS_ARN, ENV_NAMES.SERVICE_NAME);
  }

  /**
   * Grants permission to publish to this {@link Service}'s {@link eventBus}.
   */
  @grant()
  public grantPublish(grantable: IGrantable) {
    this.bus.grantPutEventsTo(grantable);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.EVENT_BUS_ARN]: () =>
      Stack.of(this.props.serviceScope).formatArn({
        service: "events",
        resource: "event-bus",
        resourceName: this.props.serviceName,
      }),
    [ENV_NAMES.SERVICE_NAME]: () => this.props.serviceName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

export interface RegistryProps {
  registryName?: string;
  description?: string;
  schemas?: Schemas;
}

export class Registry extends Resource {
  /**
   * The underlying CloudFormation Schema Registry.
   */
  public readonly resource: aws_eventschemas.CfnRegistry;
  /**
   * ARN of the Schema Registry.
   */
  public readonly registryArn: string;
  /**
   * Name of the Schema Registry.
   */
  public readonly registryName: string;

  // internal Construct for namespacing Schemas.
  public readonly schema: Schema;

  constructor(scope: Construct, id: string, props: RegistryProps) {
    super(scope, id);

    this.resource = new aws_eventschemas.CfnRegistry(this, "Resource", {
      registryName: props.registryName,
      description: props.description,
    });

    this.registryArn = this.resource.attrRegistryArn;
    this.registryName = this.resource.attrRegistryName;

    this.schema = new Schema(this, "Schema", {
      schemaRegistry: this,
      schemaName: props.registryName,
      schemas: props.schemas,
    });
  }
}

export interface SchemaProps {
  schemaRegistry: Registry;
  schemaName?: string;
  schemas?: Schemas;
}

export class Schema extends Resource {
  /**
   * The underlying Schema CloudFormation Resource.
   */
  public readonly resource: aws_eventschemas.CfnSchema;
  /**
   * Schemas inside this Schema registration.
   */
  public readonly schemas: Schemas;

  constructor(scope: Construct, id: string, props: SchemaProps) {
    super(scope, id);

    this.schemas = props.schemas ?? {};

    this.resource = new aws_eventschemas.CfnSchema(this, "Resource", {
      registryName: props.schemaRegistry.registryName,
      schemaName: props.schemaName,
      type: "OpenApi3",
      content: Lazy.string({
        produce: () =>
          JSON.stringify({
            openapi: "3.0.0",
            info: {
              version: "1.0.0",
              title: props.schemaName ?? props.schemaRegistry.registryName,
            },
            components: {
              schemas: props.schemas,
            },
            paths: {},
          } satisfies OpenAPIObject),
      }),
    });
  }

  public addSchema(schemaName: string, schema: SchemaObject): void {
    if (schemaName in this.schemas) {
      throw new Error(`schema ${schemaName} already exists in this Registry`);
    }
    this.schemas[schemaName] = schema;
  }
}

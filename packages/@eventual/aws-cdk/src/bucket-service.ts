import { CorsHttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import type { BucketRuntimeOverrides } from "@eventual/aws-runtime";
import {
  bucketServiceBucketName,
  bucketServiceBucketSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import type {
  BucketNotificationHandlerFunction,
  BucketRuntime,
} from "@eventual/core-runtime";
import { IGrantable, IPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { CorsOptions } from "./command-service";
import {
  configureWorkerCalls,
  WorkerServiceConstructProps,
} from "./service-common";
import { ServiceFunction } from "./service-function";
import { formatBucketArn, serviceBucketArn, ServiceEntityProps } from "./utils";
import { EventualResource } from "./resource";
import { SecureBucket } from "./secure/bucket";

export type BucketOverrides<Service> = Partial<
  ServiceEntityProps<
    Service,
    "Bucket",
    BucketRuntimeOverrides & Partial<s3.BucketProps>
  >
>;

export type BucketNotificationHandlerOverrides<Service> = Partial<
  ServiceEntityProps<
    Service,
    "BucketNotificationHandler",
    BucketNotificationHandlerFunctionProps
  >
>;

export type ServiceBuckets<Service> = ServiceEntityProps<
  Service,
  "Bucket",
  IBucket
>;

export type ServiceBucketNotificationHandlers<Service> = ServiceEntityProps<
  Service,
  "BucketNotificationHandler",
  BucketNotificationHandler
>;

export type BucketNotificationHandlerFunctionProps = Omit<
  Partial<FunctionProps>,
  "code" | "handler" | "functionName" | "events"
>;

export interface BucketServiceProps<Service>
  extends WorkerServiceConstructProps {
  bucketOverrides?: BucketOverrides<Service>;
  bucketHandlerOverrides?: BucketNotificationHandlerOverrides<Service>;
  cors?: CorsOptions;
}

export class BucketService<Service> {
  public buckets: ServiceBuckets<Service>;
  public bucketHandlers: ServiceBucketNotificationHandlers<Service>;

  constructor(private props: BucketServiceProps<Service>) {
    const bucketsScope = new Construct(props.serviceScope, "Buckets");

    this.buckets = Object.fromEntries(
      props.build.buckets.buckets.map((b) => [
        b.name,
        new Bucket(bucketsScope, {
          bucket: b,
          bucketService: this,
          serviceProps: props,
        }),
      ])
    ) as ServiceBuckets<Service>;

    this.bucketHandlers = Object.values(
      this.buckets as Record<string, Bucket>
    ).reduce((handlers: Record<string, BucketNotificationHandler>, ent) => {
      return {
        ...handlers,
        ...ent.handlers,
      };
    }, {}) as ServiceBucketNotificationHandlers<Service>;
  }

  public configureReadWriteBuckets(func: Function) {
    this.addEnvs(func, ENV_NAMES.SERVICE_NAME, ENV_NAMES.BUCKET_OVERRIDES);
    this.grantReadWriteBuckets(func);
  }

  public grantReadWriteBuckets(grantee: IGrantable) {
    // find any bucket names that were provided by the service and not computed
    const bucketNameOverrides = this.props.bucketOverrides
      ? Object.values(
          this.props.bucketOverrides as Record<string, BucketRuntimeOverrides>
        )
          .map((s) => s.bucketName)
          .filter((s): s is string => !!s)
      : [];

    // grants the permission to start any task
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["s3:List*"],
        resources: [
          serviceBucketArn(
            this.props.serviceName,
            bucketServiceBucketSuffix("*"),
            false
          ),
          ...bucketNameOverrides.map(formatBucketArn),
        ],
      })
    );

    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          "s3:List*",
          "s3:GetObject*",
          "s3:PutObject*",
          "s3:DeleteObject*",
        ],
        resources: [
          `${serviceBucketArn(
            this.props.serviceName,
            bucketServiceBucketSuffix("*"),
            false
          )}/*`,
          ...bucketNameOverrides.map((s) => formatBucketArn(`${s}/*`)),
        ],
      })
    );
    if (this.props.compliancePolicy.isCustomerManagedKeys()) {
      // data in the buckets are encrypted with a key that the customer owns
      this.props.compliancePolicy.dataEncryptionKey.grantEncryptDecrypt(
        grantee
      );
    }
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_NAME]: () => this.props.serviceName,
    [ENV_NAMES.BUCKET_OVERRIDES]: () =>
      Stack.of(this.props.serviceScope).toJsonString(
        this.props.bucketOverrides
      ),
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface BucketProps {
  serviceProps: BucketServiceProps<any>;
  bucketService: BucketService<any>;
  bucket: BucketRuntime;
}

export interface IBucket {
  bucket: s3.Bucket;
  handlers: Record<string, BucketNotificationHandler>;
}

class Bucket extends Construct implements IBucket {
  public bucket: s3.Bucket;
  public handlers: Record<string, BucketNotificationHandler>;

  constructor(scope: Construct, props: BucketProps) {
    super(scope, props.bucket.name);

    const bucketOverrides = {
      // then let the user override them
      ...props.serviceProps.bucketOverrides?.[props.bucket.name],
    };

    this.bucket = new SecureBucket(this, "Bucket", {
      compliancePolicy: props.serviceProps.compliancePolicy,
      ...bucketOverrides,
      cors:
        props.serviceProps.cors &&
        props.serviceProps.cors.allowMethods &&
        props.serviceProps.cors.allowOrigins
          ? [
              {
                allowedMethods: [
                  ...new Set(
                    props.serviceProps.cors.allowMethods.flatMap((s) =>
                      s === CorsHttpMethod.ANY
                        ? [
                            s3.HttpMethods.DELETE,
                            s3.HttpMethods.PUT,
                            s3.HttpMethods.POST,
                            s3.HttpMethods.HEAD,
                            s3.HttpMethods.GET,
                          ]
                        : Object.values(s3.HttpMethods).find(
                            (v) => s.toString() === v.toString()
                          ) ?? []
                    )
                  ),
                ],
                allowedOrigins: props.serviceProps.cors.allowOrigins,
                allowedHeaders: props.serviceProps.cors.allowHeaders,
                exposedHeaders: props.serviceProps.cors.exposeHeaders,
                maxAge: props.serviceProps.cors.maxAge?.toSeconds(),
              },
            ]
          : undefined,
      bucketName:
        bucketOverrides?.bucketName ??
        bucketServiceBucketName(
          props.serviceProps.serviceName,
          props.bucket.name
        ),
      autoDeleteObjects: bucketOverrides?.autoDeleteObjects ?? true,
      removalPolicy: bucketOverrides?.removalPolicy ?? RemovalPolicy.DESTROY,
      versioned: bucketOverrides?.versioned ?? props.bucket.options?.versioned,
    });

    const bucketHandlerScope = new Construct(this, "BucketHandlers");

    this.handlers = Object.fromEntries(
      props.bucket.handlers.map((s) => [
        s.spec.name,
        new BucketNotificationHandler(bucketHandlerScope, s.spec.name, {
          bucket: this.bucket,
          bucketService: props.bucketService,
          serviceProps: props.serviceProps,
          handler: s,
        }),
      ])
    );
  }
}

interface BucketNotificationHandlerProps {
  bucket: s3.Bucket;
  serviceProps: BucketServiceProps<any>;
  bucketService: BucketService<any>;
  handler: BucketNotificationHandlerFunction;
}

export class BucketNotificationHandler
  extends Construct
  implements EventualResource
{
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(
    scope: Construct,
    id: string,
    props: BucketNotificationHandlerProps
  ) {
    super(scope, id);

    const handlerName = props.handler.spec.name;
    const bucketName = props.handler.spec.bucketName;

    this.handler = new ServiceFunction(this, "Handler", {
      build: props.serviceProps.build,
      bundledFunction: props.handler,
      functionNameSuffix: `bucket-handler-${bucketName}-${handlerName}`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.BUCKET_NAME]: bucketName,
          [ENV_NAMES.BUCKET_HANDLER_NAME]: handlerName,
          ...props.serviceProps.environment,
        },
        events: [
          new S3EventSource(props.bucket, {
            events: !props.handler.spec.options?.eventTypes
              ? [
                  s3.EventType.OBJECT_CREATED_PUT,
                  s3.EventType.OBJECT_CREATED_COPY,
                  s3.EventType.OBJECT_REMOVED,
                ]
              : props.handler.spec.options.eventTypes.map((o) => {
                  return o === "put"
                    ? s3.EventType.OBJECT_CREATED_PUT
                    : o === "copy"
                    ? s3.EventType.OBJECT_CREATED_COPY
                    : s3.EventType.OBJECT_REMOVED;
                }),
            filters: props.handler.spec.options?.filters,
          }),
        ],
      },
      runtimeProps: props.handler.spec.options,
      overrides: props.serviceProps.bucketHandlerOverrides?.[handlerName],
    });

    // let the handler worker use the service client.
    configureWorkerCalls(props.serviceProps, this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}

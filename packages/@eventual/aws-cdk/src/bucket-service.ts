import {
  bucketServiceBucketName,
  bucketServiceBucketSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import { BucketRuntime, BucketStreamFunction } from "@eventual/core-runtime";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { IGrantable, IPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { CommandService, CorsOptions } from "./command-service";
import { EntityService, EntityStreamOverrides } from "./entity-service";
import { LazyInterface } from "./proxy-construct";
import { EventualResource, ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";
import { serviceBucketArn, ServiceEntityProps } from "./utils";

export type BucketStreamOverrides<Service> = Partial<
  ServiceEntityProps<Service, "BucketStream", BucketStreamHandlerProps>
>;

export type ServiceBuckets<Service> = ServiceEntityProps<
  Service,
  "Bucket",
  Bucket
>;

export type ServiceBucketStreams<Service> = ServiceEntityProps<
  Service,
  "BucketStream",
  BucketStream
>;

export interface BucketStreamHandlerProps
  extends Omit<
    Partial<FunctionProps>,
    "code" | "handler" | "functionName" | "events"
  > {}

export interface BucketServiceProps<Service> extends ServiceConstructProps {
  commandService: LazyInterface<CommandService<Service>>;
  entityService: LazyInterface<EntityService<Service>>;
  bucketStreamOverrides?: EntityStreamOverrides<Service>;
  cors?: CorsOptions;
}

export class BucketService<Service> {
  public buckets: ServiceBuckets<Service>;
  public bucketStreams: ServiceBucketStreams<Service>;

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

    this.bucketStreams = Object.values(
      this.buckets as Record<string, Bucket>
    ).reduce((streams: Record<string, BucketStream>, ent) => {
      return {
        ...streams,
        ...ent.streams,
      };
    }, {}) as ServiceBucketStreams<Service>;
  }

  public configureReadWriteBuckets(func: Function) {
    this.addEnvs(func, ENV_NAMES.SERVICE_NAME);
    this.grantReadWriteBuckets(func);
  }

  public grantReadWriteBuckets(grantee: IGrantable) {
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

interface BucketProps {
  serviceProps: BucketServiceProps<any>;
  bucketService: BucketService<any>;
  bucket: BucketRuntime;
}

export class Bucket extends Construct {
  public bucket: s3.Bucket;
  public streams: Record<string, BucketStream>;

  constructor(scope: Construct, props: BucketProps) {
    super(scope, props.bucket.name);
    console.log(s3);
    this.bucket = new s3.Bucket(this, "Bucket", {
      cors:
        props.serviceProps.cors &&
        props.serviceProps.cors.allowMethods &&
        props.serviceProps.cors.allowOrigins
          ? [
              {
                allowedMethods: props.serviceProps.cors.allowMethods.flatMap(
                  (s) =>
                    Object.values(s3.HttpMethods).find(
                      (v) => s.toString() === v.toString()
                    ) ?? []
                ),
                allowedOrigins: props.serviceProps.cors.allowOrigins,
                allowedHeaders: props.serviceProps.cors.allowHeaders,
                exposedHeaders: props.serviceProps.cors.exposeHeaders,
                maxAge: props.serviceProps.cors.maxAge?.toSeconds(),
              },
            ]
          : undefined,
      bucketName: bucketServiceBucketName(
        props.serviceProps.serviceName,
        props.bucket.name
      ),
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.bucket.grantReadWrite;

    const bucketStreamScope = new Construct(this, "BucketStreams");

    this.streams = Object.fromEntries(
      props.bucket.streams.map((s) => [
        s.spec.name,
        new BucketStream(bucketStreamScope, s.spec.name, {
          bucket: this.bucket,
          bucketService: props.bucketService,
          serviceProps: props.serviceProps,
          stream: s,
        }),
      ])
    );
  }
}

interface BucketStreamProps {
  bucket: s3.Bucket;
  serviceProps: BucketServiceProps<any>;
  bucketService: BucketService<any>;
  stream: BucketStreamFunction;
}

export class BucketStream extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(scope: Construct, id: string, props: BucketStreamProps) {
    super(scope, id);

    const streamName = props.stream.spec.name;
    const bucketName = props.stream.spec.bucketName;

    this.handler = new ServiceFunction(this, "Handler", {
      build: props.serviceProps.build,
      bundledFunction: props.stream,
      functionNameSuffix: `bucket-stream-${bucketName}-${streamName}`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.BUCKET_NAME]: bucketName,
          [ENV_NAMES.BUCKET_STREAM_NAME]: streamName,
          ...props.serviceProps.environment,
        },
        events: [
          new S3EventSource(props.bucket, {
            events: !props.stream.spec.options?.operations
              ? [
                  s3.EventType.OBJECT_CREATED_PUT,
                  s3.EventType.OBJECT_CREATED_COPY,
                  s3.EventType.OBJECT_REMOVED,
                ]
              : props.stream.spec.options.operations.map((o) => {
                  return o === "put"
                    ? s3.EventType.OBJECT_CREATED_PUT
                    : o === "copy"
                    ? s3.EventType.OBJECT_CREATED_COPY
                    : s3.EventType.OBJECT_REMOVED;
                }),
            filters: props.stream.spec.options?.filters,
          }),
        ],
      },
      runtimeProps: props.stream.spec.options,
      overrides: props.serviceProps.bucketStreamOverrides?.[streamName],
    });

    // let the handler worker use the service client.
    props.serviceProps.commandService.configureInvokeHttpServiceApi(
      this.handler
    );

    props.bucketService.configureReadWriteBuckets(this.handler);
    props.serviceProps.entityService.configureReadWriteEntityTable(
      this.handler
    );

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}

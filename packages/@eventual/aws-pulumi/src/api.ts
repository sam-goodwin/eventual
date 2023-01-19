import { ServiceType } from "@eventual/core/src/service-type";
import { apigatewayv2, getRegion } from "@pulumi/aws";
import { all, ComponentResource, ResourceOptions } from "@pulumi/pulumi";
import { Activities } from "./activities";
import { Events } from "./events";
import { Scheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { Workflows } from "./workflows";
import { Function } from "./aws/function";
import { BuildSource } from "@eventual/compiler";
import { baseFnProps, outDir, runtimeHandlersEntrypoint } from "./utils";
import { getAccountAlias, PolicyStatement } from "@pulumi/aws/iam";
import { IGrantable } from "./aws/grantable";
import { FileAsset } from "@pulumi/pulumi/asset";
import { bundleSources } from "./compile-client";

export interface ApiProps {
  serviceName: string;
  environment?: Record<string, string>;
  entry: string;
  workflows: Workflows;
  activities: Activities;
  scheduler: Scheduler;
  events: Events;
}

export class Api extends ComponentResource {
  /**
   * API Gateway for providing service api
   */
  public readonly gateway: apigatewayv2.Api;
  /*
   * The Lambda Function for processing inbound API requests with user defined code.
   */
  public readonly handler: Function;

  constructor(id: string, private props: ApiProps, opts?: ResourceOptions) {
    super("eventual:Api", id, undefined, opts);

    this.handler = new ServiceFunction(
      "Handler",
      {
        name: `${props.serviceName}-api-handler`,
        serviceType: ServiceType.ApiHandler,
        memorySize: 512,
        environment: props.environment,
      },
      {
        parent: this,
      }
    );
    props.activities.configureCompleteActivity(this.handler);
    props.activities.configureScheduleActivity(this.handler);
    props.activities.configureUpdateActivity(this.handler);
    props.workflows.configureSendSignal(this.handler);
    props.workflows.configureSendWorkflowEvent(this.handler);
    props.workflows.configureStartExecution(this.handler);

    this.gateway = new apigatewayv2.Api("Gateway", {
      name: `eventual-api-${props.serviceName}`,
      protocolType: "HTTP",
      routeKey: "$default",
      target: this.handler.functionArn,
    });

    // TODO move the API definition to the aws-runtime or core-runtime
    //      https://github.com/functionless/eventual/issues/173
    this.applyRouteMappings({
      "/_eventual/workflows": {
        methods: ["GET"],
        entry: {
          name: "list-workflows",
          entry: runtimeHandlersEntrypoint("api/list-workflows"),
        },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: ["POST"],
          entry: {
            name: "start-execution",
            entry: runtimeHandlersEntrypoint("api/executions/new"),
          },
          grants: (fn) => {
            props.workflows.configureStartExecution(fn);
          },
        },
      ],
      "/_eventual/executions": {
        methods: ["GET"],
        entry: {
          name: "list-executions",
          entry: runtimeHandlersEntrypoint("api/executions/list"),
        },
        grants: (fn) => {
          props.workflows.configureReadWorkflowData(fn);
        },
      },
      "/_eventual/executions/{executionId}": {
        methods: ["GET"],
        entry: {
          name: "get-execution",
          entry: runtimeHandlersEntrypoint("api/executions/get"),
        },
        grants: (fn) => props.workflows.configureReadWorkflowData(fn),
      },
      "/_eventual/executions/{executionId}/history": {
        methods: ["GET"],
        entry: {
          name: "executions-events",
          entry: runtimeHandlersEntrypoint("api/executions/history"),
        },
        grants: (fn) => props.workflows.configureReadWorkflowData(fn),
      },
      "/_eventual/executions/{executionId}/signals": {
        methods: ["PUT"],
        entry: {
          name: "send-signal",
          entry: runtimeHandlersEntrypoint("api/executions/signals/send"),
        },
        grants: (fn) => {
          props.workflows.configureReadWorkflowData(fn);
          props.workflows.configureSendSignal(fn);
        },
      },
      "/_eventual/executions/{executionId}/workflow-history": {
        methods: ["GET"],
        entry: {
          name: "executions-history",
          entry: runtimeHandlersEntrypoint("api/executions/workflow-history"),
        },
        // TODO fix me
        grants: (fn) => {
          props.activities.configureFullControl(fn);
          props.workflows.configureReadHistory(fn);
          props.scheduler.configureScheduleTimer(fn);
        },
      },
      "/_eventual/events": {
        methods: ["PUT"],
        entry: {
          name: "publish-events",
          entry: runtimeHandlersEntrypoint("api/publish-events"),
        },
        grants: (fn) => {
          props.events.configurePublish(fn);
        },
      },
      "/_eventual/activities": {
        methods: ["POST"],
        entry: {
          name: "update-activity",
          entry: runtimeHandlersEntrypoint("api/update-activity"),
        },
        grants: (fn) => {
          props.activities.configureUpdateActivity(fn);
          props.activities.configureCompleteActivity(fn);
        },
      },
    });

    this.configureApiHandler();
  }

  public grantExecute(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      this.executeApiPolicyStatement()
    );
  }

  private executeApiPolicyStatement(): PolicyStatement {
    return {
      Effect: "Allow",
      Action: "execute-api:*",
      // arn:partition:execute-api:region:account-id:api-id/stage/http-method/resource-path
      Resource: all([getAccountAlias(), getRegion(), this.gateway.id]).apply(
        ([account, region, apiId]) =>
          `arn:aws:execute-api:${region}:${account}:${apiId}/*/*/*`
      ),
    };
  }

  private applyRouteMappings(
    mappings: Record<string, RouteMapping | RouteMapping[]>
  ) {
    const bundles: Omit<BuildSource, "outDir" | "injectedEntry">[] = [];
    const deferredAddRoutes: (() => void)[] = [];

    Object.entries(mappings).forEach(([path, mappings]) => {
      const mappingsArray = Array.isArray(mappings) ? mappings : [mappings];
      mappingsArray.forEach(({ entry, methods, grants }) => {
        const id = entry.name;
        // register the bundles we need to make
        bundles.push(entry);
        // create a closure that creates the gateway route.
        // lambda validates the code bundle immediately so we need to bundle
        // before creating the lambda.
        deferredAddRoutes.push(() => {
          const fn = this.prebundledLambda(id, entry.name);
          grants?.(fn);

          methods?.forEach((method) => {
            new apigatewayv2.Route("", {
              apiId: this.gateway.apiEndpoint,
              routeKey: `${method} ${path}`,
              authorizationType: "AWS_IAM",
              target: fn.functionArn,
            });
          });
        });
      });
    });

    const bundle = outDir(this).apply((path) =>
      bundleSources(path, this.props.entry, ...bundles)
    );
    this.registerOutputs(bundle);

    // actually create the lambda and routes.
    deferredAddRoutes.forEach((a) => a());
  }

  private prebundledLambda(id: string, entry: string) {
    return new Function(
      id,
      {
        code: outDir(this, entry).apply((path) => new FileAsset(path)),
        ...baseFnProps,
        handler: "index.handler",
      },
      {
        parent: this,
      }
    );
  }

  private configureApiHandler() {
    this.props.workflows.configureFullControl(this.handler);
    this.props.events.configurePublish(this.handler);
  }
}

export type HttpMethod =
  | "DELETE"
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "OPTIONS";

interface RouteMapping {
  methods?: HttpMethod[];
  entry: Omit<BuildSource, "outDir" | "injectedEntry">;
  grants?: (grantee: Function) => void;
}

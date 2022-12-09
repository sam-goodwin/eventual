import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES, ServiceProperties } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { Arn, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import path from "path";
import { Scheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { baseNodeFnProps, outDir } from "./utils";

export interface ServiceApiProps {
  serviceName: string;
  environment?: Record<string, string>;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  table: ITable;
  /**
   * Workflow (fifo) queue which contains events that wake up a workflow execution.
   *
   * {@link WorkflowTask} delivery new {@link HistoryEvent}s to the workflow.
   */
  workflowQueue: IQueue;
  /**
   * S3 bucket that contains events necessary to replay a workflow execution.
   *
   * The orchestrator reads from history at the start and updates it at the end.
   */
  history: IBucket;
  /**
   * The lambda function which runs the user's Activities.
   */
  activityWorker: Function;
  /**
   * The lambda function which runs the user's Workflow.
   */
  orchestrator: Function;
  /**
   * The Resources for schedules and sleep timers.
   */
  scheduler: Scheduler;
}

export class ServiceApi extends Construct {
  /**
   * API Gateway for providing service api
   */
  public readonly gateway: HttpApi;
  /*
   * The Lambda Function for processing inbound API requests with user defined code.
   */
  public readonly handler: Function;

  constructor(scope: Construct, id: string, props: ServiceApiProps) {
    super(scope, id);

    this.handler = new ServiceFunction(this, "Handler", {
      serviceType: ServiceType.ApiHandler,
      memorySize: 512,
      environment: props.environment,
    });

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultAuthorizer: new HttpIamAuthorizer(),
      defaultIntegration: new HttpLambdaIntegration("default", this.handler),
    });

    const apiLambdaEnvironment = {
      SERVICE: JSON.stringify({
        name: props.serviceName,
        tableName: props.table.tableName,
        workflowQueueUrl: props.workflowQueue.queueUrl,
        executionHistoryBucket: props.history.bucketName,
        orchestratorFunctionName: props.orchestrator.functionName,
        activityWorkerFunctionName: props.activityWorker.functionName,
      } satisfies ServiceProperties),
      [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]:
        props.activityWorker.functionName,
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: props.history.bucketName,
      [ENV_NAMES.TABLE_NAME]: props.table.tableName,
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: props.workflowQueue.queueUrl,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: props.scheduler.schedulerRole.roleArn,
      [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: props.scheduler.dlq.queueArn,
      [ENV_NAMES.SCHEDULER_GROUP]: props.scheduler.schedulerGroup.ref,
      [ENV_NAMES.TIMER_QUEUE_URL]: props.scheduler.timerQueue.queueUrl,
      [ENV_NAMES.SCHEDULE_FORWARDER_ARN]:
        props.scheduler.scheduleForwarder.functionArn,
    };

    interface RouteMapping {
      methods?: HttpMethod[];
      entry: { api: string } | { bundled: string };
      grants?: (grantee: IGrantable) => void;
    }

    const route = (mappings: Record<string, RouteMapping | RouteMapping[]>) => {
      Object.entries(mappings).forEach(([path, mappings]) => {
        const mappingsArray = Array.isArray(mappings) ? mappings : [mappings];
        mappingsArray.forEach(({ entry, methods, grants }) => {
          const id =
            //Generate id for the lambda based on its path and method
            path
              .slice(1)
              .replace("/", "-")
              .replace(/[\{\}]/, "") + methods?.join("-") ?? [];
          const fn =
            "api" in entry
              ? this.apiLambda(id, entry.api, apiLambdaEnvironment)
              : this.prebundledLambda(id, entry.bundled, apiLambdaEnvironment);
          grants?.(fn);
          const integration = new HttpLambdaIntegration(
            `${id}-integration`,
            fn
          );
          this.gateway.addRoutes({
            path,
            integration,
            methods,
          });
        });
      });
    };

    route({
      "/_eventual/workflows": {
        methods: [HttpMethod.GET],
        entry: { bundled: "list-workflows" },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: { api: "executions/new.js" },
          grants: (fn) => {
            props.table.grantReadWriteData(fn);
            props.workflowQueue.grantSendMessages(fn);
          },
        },
        {
          methods: [HttpMethod.GET],
          entry: { api: "executions/list.js" },
          grants: (fn) => {
            props.table.grantReadWriteData(fn);
            props.workflowQueue.grantSendMessages(fn);
          },
        },
      ],
      "/_eventual/executions/{executionId}/history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/history.js" },
        grants: (fn) => props.table.grantReadData(fn),
      },
      "/_eventual/executions/{executionId}/workflow-history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/workflow-history.js" },
        grants: (fn) => props.history.grantRead(fn),
      },
    });
  }

  public grantExecute(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      this.executeApiPolicyStatement()
    );
  }

  private executeApiPolicyStatement() {
    return new PolicyStatement({
      actions: ["execute-api:*"],
      effect: Effect.ALLOW,
      resources: [
        Arn.format(
          {
            service: "execute-api",
            resource: this.gateway.apiId,
            resourceName: "*/*/*",
          },
          Stack.of(this)
        ),
      ],
    });
  }

  private apiLambda(
    id: string,
    entry: string,
    environment: Record<string, string>
  ): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/api",
        entry
      ),
      ...baseNodeFnProps,
      environment,
    });
  }

  private prebundledLambda(
    id: string,
    entry: string,
    environment: Record<string, string>
  ) {
    return new Function(this, id, {
      code: Code.fromAsset(outDir(this, entry)),
      ...baseNodeFnProps,
      handler: "index.handler",
      environment,
    });
  }
}

import { ArnFormat, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import {
  WebSocketApi,
  WebSocketIntegration,
  WebSocketStage,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { CfnIntegrationResponse } from "aws-cdk-lib/aws-apigatewayv2";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnPermission } from "aws-cdk-lib/aws-lambda";
import { Workflow } from "@eventual/aws-cdk";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import esbuild from "esbuild";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import path from "path";

export class Tester extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const table = new Table(this, "table", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: { name: "sk", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const workflow = new Workflow(this, "testWorkflow", {
      entry: require.resolve("test-app-runtime/lib/tester/workflow.js"),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const wsHandler = new NodejsFunction(this, "node", {
      entry: require.resolve(
        "test-app-runtime/lib/tester/websocket-handler.js"
      ),
      environment: {
        TABLE_NAME: table.tableName,
        WORKFLOW_TABLE: workflow.table.tableName,
        WORKFLOW_QUEUE_URL: workflow.workflowQueue.queueUrl,
      },
    });

    const handlerIntegration = new WebSocketLambdaIntegration(
      "handler",
      wsHandler
    );

    const api = new WebSocketApi(this, "api", {
      connectRouteOptions: { integration: handlerIntegration },
      disconnectRouteOptions: { integration: handlerIntegration },
      defaultRouteOptions: { integration: handlerIntegration },
    });

    // @ts-ignore - integration isn't exposed, but integrationId is needed to create a response.
    const integration = handlerIntegration.integration as WebSocketIntegration;

    new CfnIntegrationResponse(this, "response", {
      integrationId: integration.integrationId,
      apiId: api.apiId,
      integrationResponseKey: "$default",
    });

    // https://aws.amazon.com/premiumsupport/knowledge-center/api-gateway-rest-api-lambda-integrations/
    new CfnPermission(this, "LambdaInvokeAccessRemote", {
      action: "lambda:InvokeFunction",
      functionName: wsHandler.functionName,
      principal: "apigateway.amazonaws.com",
      sourceArn: `${Stack.of(this).formatArn({
        resource: api.apiId,
        service: "execute-api",
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      })}/*`,
    });

    const apiStage = new WebSocketStage(this, "propState", {
      webSocketApi: api,
      stageName: "dev",
      autoDeploy: true,
    });

    const webBucket = new Bucket(this, "websiteBucket", {
      websiteIndexDocument: "index.html",
      removalPolicy: RemovalPolicy.DESTROY,
      publicReadAccess: true,
      autoDeleteObjects: true,
    });

    const result = esbuild.buildSync({
      bundle: true,
      entryPoints: [
        require.resolve("test-app-runtime/lib/tester/website/index.js"),
      ],
      external: ["./data.js"],
      write: false,
    });

    new BucketDeployment(this, "deployWeb", {
      sources: [
        Source.asset(
          path.join(require.resolve("test-app-runtime"), "../../static/tester")
        ),
        Source.data(
          "index.js",
          Buffer.from(result.outputFiles![0]!.contents)
            .toString("utf-8")
            .replace("[WEBSOCKETURL]", apiStage.url)
        ),
      ],
      destinationBucket: webBucket,
    });

    // Grant the worker the ability to send messages to connections.
    api.grantManageConnections(workflow.grantPrincipal);

    // Grant the worker the ability to read from dynamo
    table.grantReadData(workflow.activityWorker);
    table.grantReadWriteData(wsHandler);

    // TODO: Support method on Workflow to grant all start workflow permissions
    // grant the handler the ability to start workflows (send to SQS)
    workflow.workflowQueue.grantSendMessages(wsHandler);

    // grant the handler the ability to start workflows (write new workflow to dynamo)
    workflow.table.grantReadWriteData(wsHandler);
  }
}

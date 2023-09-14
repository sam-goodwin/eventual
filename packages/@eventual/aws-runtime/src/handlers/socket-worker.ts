import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { createSocketWorker, getLazy } from "@eventual/core-runtime";
import type {
  APIGatewayEventWebsocketRequestContextV2,
  APIGatewayProxyEventV2WithRequestContext,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createOpenSearchClient,
  createQueueClient,
  createServiceClient,
  createSocketClient,
} from "../create.js";
import { serviceName, serviceUrl, socketName } from "../env.js";

const worker = createSocketWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  openSearchClient: await createOpenSearchClient(serviceSpec),
  queueClient: createQueueClient(),
  serviceClient: createServiceClient({}),
  serviceName,
  serviceSpec,
  serviceUrl,
  socketClient: createSocketClient(),
});

export default async (
  event: APIGatewayProxyEventV2WithRequestContext<APIGatewayEventWebsocketRequestContextV2>
): Promise<APIGatewayProxyResultV2<never> | undefined> => {
  const workerEvent =
    event.requestContext.routeKey === "$connect"
      ? {
          type: "connect" as const,
          connectionId: event.requestContext.connectionId,
          query: event.queryStringParameters,
          headers: event.headers,
        }
      : event.requestContext.routeKey === "$disconnect"
      ? {
          type: "disconnect" as const,
          connectionId: event.requestContext.connectionId,
        }
      : {
          type: "message" as const,
          body:
            event.isBase64Encoded && event.body
              ? Buffer.from(event.body, "base64")
              : event.body,
          connectionId: event.requestContext.connectionId,
        };

  const result = await worker(getLazy(socketName), workerEvent);

  if (result) {
    const [data, base64] = result.message
      ? result.message instanceof Buffer
        ? [result.message.toString("base64"), true]
        : [JSON.stringify(result.message), false]
      : [undefined, false];

    return {
      statusCode: result.status,
      body: data,
      isBase64Encoded: base64,
    };
  }

  return {
    statusCode: 200,
  };
};

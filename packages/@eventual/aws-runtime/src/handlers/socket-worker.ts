import {
  SocketHandlerWorkerEvent,
  createSocketHandlerWorker,
  getLazy,
} from "@eventual/core-runtime";
import {
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
import serviceSpec from "../injected/service-spec.js";

const worker = createSocketHandlerWorker({
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
      ? ({
          type: "$connect",
          request: {
            connectionId: event.requestContext.connectionId,
            query: event.queryStringParameters,
          },
        } satisfies SocketHandlerWorkerEvent<"$connect">)
      : event.requestContext.routeKey === "$disconnect"
      ? ({
          type: "$disconnect",
          request: { connectionId: event.requestContext.connectionId },
        } satisfies SocketHandlerWorkerEvent<"$disconnect">)
      : ({
          type: "$default",
          request: {
            body: event.body,
            connectionId: event.requestContext.connectionId,
            headers: event.headers,
          },
        } satisfies SocketHandlerWorkerEvent<"$default">);

  const result = await worker(getLazy(socketName), workerEvent);

  if (result) {
    const [data, base64] =
      result instanceof Buffer
        ? [result.toString("base64"), true]
        : [JSON.stringify(result), false];

    return {
      statusCode: 200,
      body: data,
      isBase64Encoded: base64,
    };
  }

  return undefined;
};

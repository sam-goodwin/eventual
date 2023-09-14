import {
  SocketConnectRequest,
  SocketDisconnectRequest,
  SocketHandlerContext,
  SocketMessageRequest,
  SocketMiddleware,
  SocketRequest,
  SocketResponse,
} from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import { getLazy, withMiddlewares } from "../utils.js";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export type SocketWorkerDependencies = WorkerIntrinsicDeps;

function isSocketRequestType<Type extends SocketRequest["type"]>(
  type: Type,
  request: SocketRequest
): request is SocketRequest & { type: Type } {
  return request.type === type;
}

export interface SocketWorker {
  (socketName: string, request: SocketRequest): Promise<SocketResponse>;
}

export function createSocketWorker(
  dependencies: SocketWorkerDependencies
): SocketWorker {
  return createEventualWorker(
    { serviceType: ServiceType.SocketWorker, ...dependencies },
    async (socketName, request) => {
      const socket = getEventualResource("Socket", socketName);
      if (!socket) throw new Error(`Socket ${socketName} does not exist`);
      const handlers = socket.handlers;

      const context: SocketHandlerContext = {
        socket: { socketName },
        service: {
          serviceName: getLazy(dependencies.serviceName),
          serviceUrl: getLazy(dependencies.serviceUrl),
        },
      };

      if (isSocketRequestType("connect", request)) {
        return withMiddlewares<SocketHandlerContext, any, SocketConnectRequest>(
          getSocketMiddlewaresWithFunction("connect", socket.middlewares),
          async (request, context) =>
            (await handlers.$connect(request, context)) ?? { status: 200 }
        )(request, context);
      } else if (isSocketRequestType("disconnect", request)) {
        return withMiddlewares<
          SocketHandlerContext,
          any,
          SocketDisconnectRequest
        >(
          getSocketMiddlewaresWithFunction("disconnect", socket.middlewares),
          async (request, context) =>
            (await handlers.$disconnect(request, context)) ?? { status: 200 }
        )(request, context);
      } else if (isSocketRequestType("message", request)) {
        return withMiddlewares<SocketHandlerContext, any, SocketMessageRequest>(
          getSocketMiddlewaresWithFunction("message", socket.middlewares),
          async (request, context) =>
            (await handlers.$default(request, context)) ?? { status: 200 }
        )(request, context);
      }
    }
  );
}

function getSocketMiddlewaresWithFunction<
  Fn extends Exclude<keyof SocketMiddleware, symbol>
>(
  fn: Fn,
  middlewares: SocketMiddleware[]
): Exclude<SocketMiddleware[Fn], undefined>[] {
  return middlewares
    .map((m) => m[fn])
    .filter((m): m is Exclude<typeof m, undefined> => !!m);
}

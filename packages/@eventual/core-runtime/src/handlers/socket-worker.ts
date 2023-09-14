import {
  SocketConnectionRequest,
  SocketHandlerContext,
  SocketHandlers,
  SocketResponse,
} from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import { getLazy, withMiddlewares } from "../utils.js";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export type SocketHandlerDependencies = WorkerIntrinsicDeps;

export interface SocketHandlerWorkerEvent<Type extends keyof SocketHandlers> {
  type: Type;
  request: Parameters<SocketHandlers[Type]>[0];
}

function isSocketHandlerEventType<Type extends keyof SocketHandlers>(
  type: Type,
  event: SocketHandlerWorkerEvent<any>
): event is SocketHandlerWorkerEvent<Type> {
  return event.type === type;
}

export interface SocketHandlerWorker {
  (
    socketName: string,
    event: SocketHandlerWorkerEvent<any>
  ): Promise<SocketResponse>;
}

export function createSocketHandlerWorker(
  dependencies: SocketHandlerDependencies
): SocketHandlerWorker {
  return createEventualWorker(
    { serviceType: ServiceType.SocketWorker, ...dependencies },
    async (socketName, event) => {
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

      if (isSocketHandlerEventType("$connect", event)) {
        return withMiddlewares<
          SocketHandlerContext,
          SocketResponse,
          SocketConnectionRequest
        >(
          socket.connectMiddlewares,
          async (request, context) =>
            (await handlers.$connect(request, context)) ?? { status: 200 }
        )(event.request, context);
      } else if (isSocketHandlerEventType("$disconnect", event)) {
        return await handlers.$disconnect(event.request, context);
      } else if (isSocketHandlerEventType("$default", event)) {
        return handlers.$default(event.request, context);
      }
    }
  );
}

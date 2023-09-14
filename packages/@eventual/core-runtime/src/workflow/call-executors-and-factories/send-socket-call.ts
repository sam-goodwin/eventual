import { EventualError } from "@eventual/core";
import {
  SocketRequestFailed,
  SocketRequestSucceeded,
  WorkflowCallHistoryType,
  WorkflowEventType,
  isSocketCallOperation,
  type SocketCall,
  type SocketMethod,
  type SocketOperation,
} from "@eventual/core/internal";
import { SocketCallExecutor } from "../../call-executors/socket-call-executor.js";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { SocketClient } from "../../clients/socket-client.js";
import { Result, normalizeError } from "../../result.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import { createEvent } from "../events.js";
import { EventualDefinition, Trigger } from "../eventual-definition.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createSocketWorkflowQueueExecutor(
  socketClient: SocketClient,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new SocketCallExecutor(socketClient),
    queueClient,
    async (call: SocketCall, result, { executionTime, seq }) => {
      return createEvent<SocketRequestSucceeded>(
        {
          type: WorkflowEventType.SocketRequestSucceeded,
          operation: call.operation.operation,
          result,
          seq,
        },
        executionTime
      );
    },
    (call, err, { executionTime, seq }) => {
      return createEvent<SocketRequestFailed>(
        {
          type: WorkflowEventType.SocketRequestFailed,
          operation: call.operation.operation,
          seq,
          ...normalizeError(err),
        },
        executionTime
      );
    }
  );
}

export class SendSocketCallEventualFactory
  implements EventualFactory<SocketCall>
{
  public initializeEventual(call: SocketCall): EventualDefinition<any> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.SocketRequestSucceeded,
          (event) => {
            return Result.resolved(event.result);
          }
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.SocketRequestFailed,
          (event) => {
            return Result.failed(new EventualError(event.error, event.message));
          }
        ),
      ],
      createCallEvent: (seq) => {
        if (isSocketCallOperation("send", call)) {
          const [connectionId, input] = call.operation.params;
          const [data, base64] =
            input instanceof Buffer
              ? [input.toString("base64"), true]
              : [input, false];

          return {
            type: WorkflowCallHistoryType.SocketRequest,
            seq,
            operation: {
              operation: "send",
              connectionId,
              input: data,
              isBase64Encoded: base64,
              socketName: call.operation.socketName,
            },
          };
        } else {
          return {
            type: WorkflowCallHistoryType.SocketRequest,
            seq,
            operation: call.operation as SocketOperation<
              Exclude<SocketMethod, "send">
            >,
          };
        }
      },
    };
  }
}

import { EventualError } from "@eventual/core";
import {
  Result,
  WorkflowCallHistoryType,
  WorkflowEventType,
  type InvokeTransactionCall,
  type TransactionRequestFailed,
  type TransactionRequestSucceeded,
} from "@eventual/core/internal";
import { TransactionCallExecutor } from "../../call-executors/transaction-call-executor.js";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import type { TransactionClient } from "../../clients/transaction-client.js";
import { normalizeError } from "../../result.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import { createEvent } from "../events.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createTransactionWorkflowQueueExecutor(
  transactionClient: TransactionClient,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new TransactionCallExecutor(transactionClient),
    queueClient,
    (_, result, { executionTime, seq }) => {
      if (result.succeeded) {
        return createEvent<TransactionRequestSucceeded>(
          {
            type: WorkflowEventType.TransactionRequestSucceeded,
            result: result.output,
            seq,
          },
          executionTime
        );
      } else {
        return createEvent<TransactionRequestFailed>(
          {
            type: WorkflowEventType.TransactionRequestFailed,
            error: "Transaction Failed",
            message: "",
            seq,
          },
          executionTime
        );
      }
    },
    (_, err, { executionTime, seq }) => {
      return createEvent<TransactionRequestFailed>(
        {
          type: WorkflowEventType.TransactionRequestFailed,
          ...normalizeError(err),
          seq,
        },
        executionTime
      );
    }
  );
}

export class TransactionCallEventualFactory
  implements EventualFactory<InvokeTransactionCall>
{
  public createEventualDefinition(
    call: InvokeTransactionCall<any>
  ): EventualDefinition<any> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.TransactionRequestSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.TransactionRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.TransactionRequest,
          input: call.input,
          seq,
          transactionName: call.transactionName,
        };
      },
    };
  }
}

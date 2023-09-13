import {
  CallKind,
  CallSymbol,
  type Call,
  type CallOutput,
} from "@eventual/core/internal";
import { Result } from "../result.js";
import { AwaitTimerClassEventualFactory } from "./call-executors-and-factories/await-timer-call.js";
import { BucketCallEventualFactory } from "./call-executors-and-factories/bucket-call.js";
import { ChildWorkflowCallEventualFactory } from "./call-executors-and-factories/child-workflow-call.js";
import { ConditionCallEventualFactory } from "./call-executors-and-factories/condition-call.js";
import { EmitEventsCallEventualFactory } from "./call-executors-and-factories/emit-events-call.js";
import { EntityCallEventualFactory } from "./call-executors-and-factories/entity-call.js";
import { ExpectSignalFactory } from "./call-executors-and-factories/expect-signal-call.js";
import { SearchCallEventualFactory } from "./call-executors-and-factories/open-search-client-call.js";
import { QueueCallEventualFactory } from "./call-executors-and-factories/queue-call.js";
import { SendSignalEventualFactory } from "./call-executors-and-factories/send-signal-call.js";
import { SendSocketCallEventualFactory } from "./call-executors-and-factories/send-socket-call.js";
import { RegisterSignalHandlerCallFactory } from "./call-executors-and-factories/signal-handler-call.js";
import { TaskCallEventualFactory } from "./call-executors-and-factories/task-call.js";
import { TransactionCallEventualFactory } from "./call-executors-and-factories/transaction-call.js";
import { UnsupportedEventualFactory } from "./call-executors-and-factories/unsupported.js";
import type { EventualDefinition } from "./eventual-definition.js";

export interface ResolveEventualFunction {
  (seq: number, result: Result): void;
}

/**
 * Turns a {@link Call} into an {@link EventualDefinition} for a {@link Workflow}.
 */
export interface EventualFactory<C extends Call = Call> {
  initializeEventual(
    call: C,
    /**
     * Call this function to resolve another eventual with a value.
     */
    resolveEventual: ResolveEventualFunction
  ): EventualDefinition<Awaited<CallOutput<C>>>;
}

export type AllWorkflowEventualFactories = {
  [K in keyof typeof CallKind]: EventualFactory<
    Call & { [CallSymbol]: (typeof CallKind)[K] }
  >;
};

export class AllWorkflowEventualFactory implements EventualFactory {
  constructor(private executors: AllWorkflowEventualFactories) {}
  public initializeEventual(
    call: Call,
    resolveEventual: ResolveEventualFunction
  ): EventualDefinition<any> {
    const kind = call[CallSymbol];
    const executor = this.executors[CallKind[kind] as keyof typeof CallKind] as
      | EventualFactory
      | undefined;

    if (executor) {
      return executor.initializeEventual(call, resolveEventual);
    }

    throw new Error(`Missing Eventual Factory for ${CallKind[kind]}`);
  }
}

export function createDefaultEventualFactory(): AllWorkflowEventualFactory {
  const unsupportedFactory = new UnsupportedEventualFactory();

  return new AllWorkflowEventualFactory({
    AwaitTimerCall: new AwaitTimerClassEventualFactory(),
    BucketCall: new BucketCallEventualFactory(),
    ChildWorkflowCall: new ChildWorkflowCallEventualFactory(),
    ConditionCall: new ConditionCallEventualFactory(),
    EmitEventsCall: new EmitEventsCallEventualFactory(),
    EntityCall: new EntityCallEventualFactory(),
    ExpectSignalCall: new ExpectSignalFactory(),
    GetExecutionCall: unsupportedFactory,
    InvokeTransactionCall: new TransactionCallEventualFactory(),
    QueueCall: new QueueCallEventualFactory(),
    SearchCall: new SearchCallEventualFactory(),
    SendSignalCall: new SendSignalEventualFactory(),
    SignalHandlerCall: new RegisterSignalHandlerCallFactory(),
    SocketSendCall: new SendSocketCallEventualFactory(),
    StartWorkflowCall: unsupportedFactory,
    TaskCall: new TaskCallEventualFactory(),
    TaskRequestCall: unsupportedFactory, // TODO: support task requests (succeed, fail, heartbeat)
  });
}

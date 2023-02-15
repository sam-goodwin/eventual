import { ulid } from "ulidx";
import { createExpectSignalCall } from "./internal/calls/expect-signal-call.js";
import { createSendSignalCall } from "./internal/calls/send-signal-call.js";
import { createRegisterSignalHandlerCall } from "./internal/calls/signal-handler-call.js";
import { isEventual } from "./internal/eventual.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import { getServiceClient } from "./internal/global.js";

/**
 * A reference to a created signal handler.
 */
export interface SignalsHandler {
  /**
   * Remove the handler from the signal.
   *
   * Any ongoing {@link Chain}s started by the handler will continue to run to completion.
   */
  dispose: () => void;
}

export type SignalHandlerFunction<Payload = void> = (
  payload: Payload
) => Promise<void> | void;

export function signal<Payload = void>(name: string): Signal<Payload> {
  return new Signal(name);
}

export class Signal<Payload = void> {
  constructor(readonly id: string) {}
  /**
   * Listens for signals sent to the current workflow.
   *
   * When the signal is received, the handler is invoked.
   * If the handler return a promise, the handler is added a {@link Chain}
   * and progressed until completion.
   *
   * ```ts
   * const mySignal = signal("MySignal");
   *
   * workflow("wf", () => {
   *    let done = false;
   *    mySignal.onSignal(async () => {
   *       await duration(10, "seconds");
   *       done = true;
   *    });
   *
   *    await condition(() => done);
   * });
   * ```
   *
   * To remove the handler, call the dispose method.
   *
   * ```ts
   * const handler = mySignal.onSignal(() => {});
   *
   * await duration(10, "seconds");
   *
   * handler.dispose();
   * ```
   */
  public onSignal(handler: SignalHandlerFunction<Payload>): SignalsHandler {
    return onSignal(this, handler);
  }

  /**
   * Waits for a signal to be received by the workflow.
   *
   * The first signal received will resolve the Promise with the payload of the promise.
   *
   * ```ts
   * const mySignal = signal<string>("MySignal");
   * workflow("wf", async () => {
   *    const payload = await mySignal.expectSignal();
   *
   *    return payload;
   * });
   * ```
   *
   * Use `opts.timeout` to stop waiting after the provided time. The Promise will reject
   * when the provided time has elapsed.
   *
   * ```ts
   * const mySignal = signal<string>("MySignal");
   * workflow("wf", async () => {
   *    try {
   *       const payload = await mySignal.expectSignal({ timeout: duration(10, "minutes) });
   *
   *       return payload;
   *    } catch {
   *       return "nothing!";
   *    }
   * });
   * ```
   */
  public expectSignal(opts?: ExpectSignalOptions): Promise<Payload> {
    return expectSignal(this, opts);
  }

  /**
   * Allows a {@link workflow} to send this signal to any workflow {@link Execution} by executionId.
   *
   * ```ts
   * const mySignal = signal<string>("MySignal");
   * workflow("wf", async () => {
   *    mySignal.sendSignal("payload");
   * })
   * ```
   */
  public sendSignal(
    executionId: string,
    ...args: SendSignalProps<Payload>
  ): Promise<void> {
    return sendSignal(executionId, this, ...args);
  }
}

export type SignalPayload<E extends Signal<any>> = E extends Signal<infer P>
  ? P
  : never;

export interface ExpectSignalOptions {
  /**
   * Optional. A promise that determines when to timeout a signal.
   *
   * Can be used together with {@link time} or {@link duration} or any other promise.
   *
   * ```ts
   * await expectSignal(signal, { timeout: duration(10, "seconds") })
   * ```
   *
   * After the provided promise resolves or rejects, the {@link expectSignal} will reject.
   *
   * You can also chain an expect signal with other promises.
   *
   * ```ts
   * const abortSignal = expectSignal(abortSignal);
   * expectSignal(signal, { timeout: abortSignal });
   * ```
   */
  timeout: Promise<any>;
}

/**
 * Waits for a signal to be received by the workflow.
 *
 * The first signal received will resolve the Promise with the payload of the promise.
 *
 * ```ts
 * workflow("wf", () => {
 *    const payload = await expectSignal("MySignal");
 *
 *    return payload;
 * });
 * ```
 *
 * Use `opts.timeout` to stop waiting after some condition. The Promise will reject
 * when the provided promise resolves.
 *
 * ```ts
 * // timeout after 10 seconds
 * await expectSignal(signal, { timeout: duration(10, "seconds") })
 * ```
 *
 * ```ts
 * // timeout after receiving a signal
 * const abortSignal = expectSignal(abortSignal);
 * await expectSignal(signal, { timeout: abortSignal });
 * ```
 */
export function expectSignal<SignalPayload = any>(
  signal: Signal<SignalPayload> | string,
  opts?: ExpectSignalOptions
): Promise<SignalPayload> {
  if (!isOrchestratorWorker()) {
    throw new Error("expectSignal is only valid in a workflow");
  }

  const timeout = opts?.timeout;
  if (timeout && !isEventual(timeout)) {
    throw new Error("Timeout promise must be an Eventual.");
  }

  return createExpectSignalCall(
    typeof signal === "string" ? signal : signal.id,
    timeout
  ) as any;
}

/**
 * Listens for a signal matching the signalId provided.
 *
 * When the signal is received, the handler is invoked.
 * If the handler return a promise, the handler is added as a {@link Chain}
 * and progressed until completion.
 *
 * ```ts
 * workflow("wf", () => {
 *    let done = false;
 *    onSignal("MySignal", async () => {
 *       await duration(10, "seconds");
 *       done = true;
 *    });
 *
 *    await condition(() => done);
 * });
 * ```
 *
 * To remove the handler, call the dispose method.
 *
 * ```ts
 * const handler = onSignal("MySignal", () => {});
 *
 * await duration(10, "seconds");
 *
 * handler.dispose();
 * ```
 */
export function onSignal<Payload>(
  signal: Signal<Payload> | string,
  handler: SignalHandlerFunction<Payload>
): SignalsHandler {
  if (!isOrchestratorWorker()) {
    throw new Error("onSignal is only valid in a workflow");
  }

  return createRegisterSignalHandlerCall(
    typeof signal === "string" ? signal : signal.id,
    handler as any
  );
}

export type SendSignalProps<SignalPayload> = [SignalPayload] extends
  | [undefined]
  | [void]
  ? []
  : [payload: SignalPayload];

/**
 * Allows a {@link workflow} to send a signal to any workflow {@link Execution} by executionId.
 *
 * ```ts
 * const mySignal = signal<string>("MySignal");
 * workflow("wf", async () => {
 *    sendSignal("mySignal", "payload");
 *    sendSignal(mySignal, "payload");
 * })
 * ```
 *
 * @param id an optional, execution unique ID, will be used to de-dupe the signal at the target execution.
 */
export function sendSignal<Payload = any>(
  executionId: string,
  signal: string | Signal<Payload>,
  ...args: SendSignalProps<Payload>
): Promise<void> {
  const [payload] = args;
  if (isOrchestratorWorker()) {
    return createSendSignalCall(
      { type: SignalTargetType.Execution, executionId },
      typeof signal === "string" ? signal : signal.id,
      payload
    ) as unknown as any;
  } else {
    return getServiceClient().sendSignal({
      execution: executionId,
      signal,
      id: ulid(),
      payload,
    });
  }
}

export type SignalTarget = ExecutionTarget | ChildExecutionTarget;

export enum SignalTargetType {
  Execution,
  ChildExecution,
}

export interface ExecutionTarget {
  type: SignalTargetType.Execution;
  executionId: string;
}

export interface ChildExecutionTarget {
  type: SignalTargetType.ChildExecution;
  workflowName: string;
  seq: number;
}

export function isChildExecutionTarget(
  target: SignalTarget
): target is ChildExecutionTarget {
  return target.type === SignalTargetType.ChildExecution;
}

export function isExecutionTarget(
  target: SignalTarget
): target is ExecutionTarget {
  return target.type === SignalTargetType.Execution;
}

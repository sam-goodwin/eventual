import { createSendSignalCall } from "./calls/send-signal-call.js";
import { createRegisterSignalHandlerCall } from "./calls/signal-handler-call.js";
import { createWaitForSignalCall } from "./calls/wait-for-signal-call.js";

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

export class Signal<Payload = void> {
  constructor(public readonly id: string) {}
  /**
   * Listens for signals sent to the current workflow.
   *
   * When the signal is received, the handler is invoked.
   * If the handler return a promise, the handler is added a {@link Chain}
   * and progressed until completion.
   *
   * ```ts
   * const mySignal = new Signal("MySignal");
   *
   * workflow("wf", () => {
   *    let done = false;
   *    mySignal.on(async () => {
   *       await sleepFor(10);
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
   * const handler = mySignal.on(() => {});
   *
   * await sleepFor(10);
   *
   * handler.dispose();
   * ```
   */
  on(handler: SignalHandlerFunction<Payload>): SignalsHandler {
    return onSignal(this, handler);
  }
  /**
   * Waits for an signal to be received by the workflow.
   *
   * The first signal received will resolve the Promise with the payload of the promise.
   *
   * ```ts
   * const mySignal = new Signal<string>("MySignal");
   * workflow("wf", async () => {
   *    const payload = await mySignal.waitFor();
   *
   *    return payload;
   * });
   * ```
   *
   * Use `opts.timeoutSeconds` to stop waiting after the provided time. The Promise will reject
   * when the provided time has elapsed.
   *
   * ```ts
   * const mySignal = new Signal<string>("MySignal");
   * workflow("wf", async () => {
   *    try {
   *       const payload = await mySignal.waitFor({ timeoutSecond: 10 * 60 });
   *
   *       return payload;
   *    } catch {
   *       return "nothing!";
   *    }
   * });
   * ```
   */
  waitFor(opts?: WaitForSignalOpts): Promise<Payload> {
    return waitForSignal(this, opts);
  }
  /**
   *
   */
  send(executionId: string, ...args: SendSignalProps<Payload>): void {
    sendSignal<Signal<Payload>>(executionId, this, ...args);
  }
}

export type SignalPayload<E extends Signal<any>> = E extends Signal<infer P>
  ? P
  : never;

export interface WaitForSignalOpts {
  /**
   * Optional. Seconds to wait for the signal to be received.
   *
   * After the provided seconds, the promise will reject.
   */
  timeoutSeconds: number;
}

/**
 * Waits for an signal to be received by the workflow.
 *
 * The first signal received will resolve the Promise with the payload of the promise.
 *
 * ```ts
 * workflow("wf", () => {
 *    const payload = await waitForSignal("MySignal");
 *
 *    return payload;
 * });
 * ```
 *
 * Use `opts.timeoutSeconds` to stop waiting after the provided time. The Promise will reject
 * when the provided time has elapsed.
 */
export function waitForSignal<SignalPayload = any>(
  signalId: string,
  opts?: WaitForSignalOpts
): Promise<SignalPayload>;
export function waitForSignal<E extends Signal<any>>(
  signal: E,
  opts?: WaitForSignalOpts
): Promise<SignalPayload<E>>;
export function waitForSignal(
  signal: Signal<any> | string,
  opts?: WaitForSignalOpts
): Promise<SignalPayload<any>> {
  return createWaitForSignalCall(
    typeof signal === "string" ? signal : signal.id,
    opts?.timeoutSeconds
  ) as any;
}

/**
 * Listens for an signal matching the signalId provided.
 *
 * When the signal is received, the handler is invoked.
 * If the handler return a promise, the handler is added as a {@link Chain}
 * and progressed until completion.
 *
 * ```ts
 * workflow("wf", () => {
 *    let done = false;
 *    onSignal("MySignal", async () => {
 *       await sleepFor(10);
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
 * await sleepFor(10);
 *
 * handler.dispose();
 * ```
 */
export function onSignal<E extends Signal<any>>(
  signal: E,
  handler: SignalHandlerFunction<SignalPayload<E>>
): SignalsHandler;
export function onSignal<Payload = void>(
  signalId: string,
  handler: SignalHandlerFunction<Payload>
): SignalsHandler;
export function onSignal(
  signal: Signal<any> | string,
  handler: SignalHandlerFunction<any>
): SignalsHandler {
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
 * Sends a signal to any other execution by executionId.
 *
 * ```ts
 * const mySignal = new Signal<string>("MySignal");
 * workflow("wf", async () => {
 *    sendSignal("mySignal", "payload");
 *    sendSignal(mySignal, "payload");
 * })
 * ```
 */
export function sendSignal<S extends Signal<any>>(
  executionId: string,
  signal: S,
  ...args: SendSignalProps<SignalPayload<S>>
): void;
export function sendSignal<Payload = any>(
  executionId: string,
  signalId: string,
  ...args: SendSignalProps<Payload>
): void;
export function sendSignal(
  executionId: string,
  signal: string | Signal<any>,
  payload?: any
): void {
  createSendSignalCall(
    { type: SignalTargetType.Execution, executionId },
    typeof signal === "string" ? signal : signal.id,
    payload
  );
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

import { ChildExecution, ExecutionHandle, ExecutionID } from "./execution.js";
import { createWorkflowCall } from "./internal/calls/workflow-call.js";
import { isChain } from "./internal/chain.js";
import { Program } from "./internal/eventual.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import { getServiceClient, workflows } from "./internal/global.js";
import {
  HistoryStateEvent,
  isTimerCompleted,
  isTimerScheduled,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
} from "./internal/workflow-events.js";
import { DurationSchedule } from "./schedule.js";
import { StartExecutionRequest } from "./service-client.js";

export interface WorkflowHandler<Input = any, Output = any> {
  (input: Input, context: WorkflowContext): Promise<Output> | Program<any>;
}

/**
 * Options which determine how a workflow operates.
 *
 * Can be provided at workflow definition time and/or overridden by the caller of {@link WorkflowClient.startWorkflow}.
 */
export interface WorkflowOptions {
  /**
   * Number of seconds before execution times out.
   *
   * @default - workflow will never timeout.
   */
  timeout?: DurationSchedule;
}

export type WorkflowOutput<W extends Workflow> = W extends Workflow<
  any,
  infer Out
>
  ? Out
  : never;

export type WorkflowInput<W extends Workflow> = W extends Workflow<
  infer In,
  any
>
  ? In
  : undefined;

/**
 * A {@link Workflow} is a long-running process that orchestrates calls
 * to other services in a durable and observable way.
 */
export interface Workflow<in Input = any, Output = any> {
  /**
   * Globally unique ID of this {@link Workflow}.
   */
  name: string;

  options?: WorkflowOptions;

  /**
   * Invokes the {@link Workflow} from within another workflow.
   *
   * This can only be called from within another workflow because it's not possible
   * to wait for completion synchronously - it relies on the event-driven environment
   * of a workflow execution.
   *
   * To start a workflow from another environment, use {@link start}.
   */
  (input: Input): Promise<Output> & ChildExecution;

  /**
   * Starts a workflow execution
   */
  startExecution(
    request: Omit<StartExecutionRequest<Workflow<Input, Output>>, "workflow">
  ): Promise<ExecutionHandle<Workflow<Input, Output>>>;
}

/**
 * Creates and registers a long-running workflow.
 *
 * Example:
 * ```ts
 * import { activity, workflow } from "@eventual/core";
 *
 * export default workflow("my-workflow", async ({ name }: { name: string }) => {
 *   const result = await hello(name);
 *   console.log(result);
 *   return `you said ${result}`;
 * });
 *
 * const hello = activity("hello", async (name: string) => {
 *   return `hello ${name}`;
 * });
 *
 * Logging using `console.info` (or similar) in a workflow will write logs to the
 * execution's log stream in the service's workflow.
 *
 * To see these logs run `eventual get logs -e <execution>` or find the log group using
 * `eventual show service`.
 * ```
 * @param name a globally unique ID for this workflow.
 * @param definition the workflow definition.
 */
export function workflow<Input = any, Output = any>(
  name: string,
  definition: WorkflowHandler<Input, Output>
): Workflow<Input, Output>;
export function workflow<Input = any, Output = any>(
  name: string,
  opts: WorkflowOptions,
  definition: WorkflowHandler<Input, Output>
): Workflow<Input, Output>;
export function workflow<Input = any, Output = any>(
  name: string,
  ...args:
    | [opts: WorkflowOptions, definition: WorkflowHandler<Input, Output>]
    | [definition: WorkflowHandler<Input, Output>]
): Workflow<Input, Output> {
  const [opts, definition] = args.length === 1 ? [undefined, args[0]] : args;
  if (workflows().has(name)) {
    throw new Error(`workflow with name '${name}' already exists`);
  }

  const workflow: Workflow<Input, Output> = ((input?: any) => {
    if (!isOrchestratorWorker()) {
      throw new Error(
        "Direct workflow invocation is only valid in a workflow, use workflow.startExecution instead."
      );
    }

    return createWorkflowCall(name, input, opts);
  }) as any;

  Object.defineProperty(workflow, "name", { value: name, writable: false });

  workflow.startExecution = async function (input) {
    const serviceClient = getServiceClient();
    return await serviceClient.startExecution<Workflow<Input, Output>>({
      workflow: name,
      executionName: input.executionName,
      input: input.input,
      timeout: input.timeout,
      ...opts,
    });
  };

  // @ts-ignore
  workflow.definition = isChain(definition)
    ? definition
    : function* (input: Input, context: WorkflowContext): any {
        return yield definition(input, context);
      }; // This type is added in the core-runtime package declaration.

  workflows().set(name, workflow);
  return workflow;
}

/**
 * Generates synthetic events, for example, {@link TimerCompleted} events when the time has passed, but a real completed event has not come in yet.
 */
export function generateSyntheticEvents(
  events: HistoryStateEvent[],
  baseTime: Date
): TimerCompleted[] {
  const unresolvedTimers: Record<number, TimerScheduled> = {};

  const timerEvents = events.filter(
    (event): event is TimerScheduled | TimerCompleted =>
      isTimerScheduled(event) || isTimerCompleted(event)
  );

  for (const event of timerEvents) {
    if (isTimerScheduled(event)) {
      unresolvedTimers[event.seq] = event;
    } else {
      delete unresolvedTimers[event.seq];
    }
  }

  const syntheticTimerComplete: TimerCompleted[] = Object.values(
    unresolvedTimers
  )
    .filter(
      (event) => new Date(event.untilTime).getTime() <= baseTime.getTime()
    )
    .map(
      (e) =>
        ({
          type: WorkflowEventType.TimerCompleted,
          seq: e.seq,
          timestamp: baseTime.toISOString(),
        } satisfies TimerCompleted)
    );

  return syntheticTimerComplete;
}

/**
 * Context values related to the current execution of the workflow.
 */
export interface WorkflowExecutionContext {
  /**
   * Computed, Unique ID of the execution.
   */
  id: ExecutionID;
  /**
   * Unique name of the execution, optionally provided in the startWorkflow call.
   */
  name: string;
  /**
   * ID of the parent execution if this is a child workflow
   */
  parentId?: ExecutionID;
  /**
   * The ISO 8601 UTC time the execution started.
   */
  startTime: string;
}

/**
 * Context values related to the workflow definition.
 */
export interface WorkflowDefinitionContext {
  /**
   * The name of the workflow.
   */
  name: string;
}

/**
 * Context values provided to each workflow execution.
 */
export interface WorkflowContext {
  /**
   * Context values related to the current execution of the workflow.
   */
  workflow: WorkflowDefinitionContext;
  /**
   * Context values related to the workflow definition.
   */
  execution: WorkflowExecutionContext;
}

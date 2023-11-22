import type {
  ChildExecution,
  Execution,
  ExecutionHandle,
  ExecutionID,
} from "./execution.js";
import { CallKind, createCall } from "./internal/calls.js";
import {
  EventualPromise,
  EventualPromiseSymbol,
} from "./internal/eventual-hook.js";
import { registerEventualResource } from "./internal/resources.js";
import {
  PropertyKind,
  createEventualProperty,
  type ServiceClientProperty,
} from "./internal/properties.js";
import { isDurationSchedule, isTimeSchedule } from "./internal/schedule.js";
import { WorkflowSpec } from "./internal/service-spec.js";
import { SignalTargetType } from "./internal/signal.js";
import type { DurationSchedule, Schedule } from "./schedule.js";
import type { StartExecutionRequest } from "./service-client.js";
import type { z } from "zod";

export interface WorkflowHandler<Input = any, Output = any> {
  (input: Input, context: WorkflowContext): Promise<Output>;
}

/**
 * Workflow options available when invoked by another workflow.
 */
export interface ChildWorkflowOptions {
  timeout?: Promise<any> | Schedule;
}

/**
 * Options which determine how an execution operates.
 *
 * Overrides those provided by the workflow definition.
 */
export interface WorkflowExecutionOptions {
  /**
   * Number of seconds before or a time to time the workflow out at.
   *
   * @default - workflow will never timeout.
   */
  timeout?: Schedule;
}

/**
 * Options which determine how a workflow operates.
 *
 * Can be provided at workflow definition time and/or overridden by the caller of {@link WorkflowClient.startWorkflow}.
 */
export interface WorkflowDefinitionOptions {
  /**
   * Number of seconds before execution times out.
   *
   * @default - workflow will never timeout.
   */
  timeout?: DurationSchedule;
}

export interface WorkflowDefinitionOptionsWithSchema<
  Input extends z.ZodRawShape | undefined = z.ZodRawShape | undefined
> extends WorkflowDefinitionOptions {
  input?: Input;
}

export type WorkflowOutput<W extends Workflow> = W extends Workflow<
  any,
  any,
  infer Out
>
  ? Out
  : never;

export type WorkflowInput<W extends Workflow> = W extends Workflow<
  any,
  infer In,
  any
>
  ? In
  : undefined;

export type WorkflowArguments<Input = any> = [Input] extends [undefined]
  ? [input?: Input, options?: ChildWorkflowOptions]
  : [input: Input, options?: ChildWorkflowOptions];

/**
 * A {@link Workflow} is a long-running process that orchestrates calls
 * to other services in a durable and observable way.
 */
export interface Workflow<
  Name extends string = string,
  in Input = any,
  Output = any
> extends WorkflowSpec<Name> {
  options?: WorkflowDefinitionOptions;
  kind: "Workflow";

  /**
   * Invokes the {@link Workflow} from within another workflow.
   *
   * This can only be called from within another workflow because it's not possible
   * to wait for completion synchronously - it relies on the event-driven environment
   * of a workflow execution.
   *
   * To start a workflow from another environment, use {@link start}.
   */
  (...args: WorkflowArguments<Input>): Promise<Output> & ChildExecution;

  /**
   * Starts a workflow execution
   */
  startExecution(
    request: Omit<
      StartExecutionRequest<Workflow<Name, Input, Output>>,
      "workflow"
    >
  ): Promise<ExecutionHandle<Workflow<Name, Input, Output>>>;

  getExecution(executionId: string): Promise<Execution<Output>>;
}

/**
 * Creates and registers a long-running workflow.
 *
 * Example:
 * ```ts
 * import { task, workflow } from "@eventual/core";
 *
 * export default workflow("my-workflow", async ({ name }: { name: string }) => {
 *   const result = await hello(name);
 *   console.log(result);
 *   return `you said ${result}`;
 * });
 *
 * const hello = task("hello", async (name: string) => {
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
export function workflow<
  Name extends string = string,
  Input = any,
  Output = any
>(
  name: Name,
  definition: WorkflowHandler<Input, Output>
): Workflow<Name, Input, Output>;
export function workflow<
  Name extends string = string,
  Input extends z.ZodRawShape = any,
  Output = any
>(
  name: Name,
  opts: WorkflowDefinitionOptionsWithSchema<Input>,
  definition: WorkflowHandler<Input, Output>
): Workflow<Name, Input, Output>;
export function workflow<
  Name extends string = string,
  Input = any,
  Output = any
>(
  name: Name,
  opts: WorkflowDefinitionOptions,
  definition: WorkflowHandler<Input, Output>
): Workflow<Name, Input, Output>;
export function workflow<
  Name extends string = string,
  Input = any,
  Output = any
>(
  name: string,
  ...args:
    | [
        opts: WorkflowDefinitionOptions,
        definition: WorkflowHandler<Input, Output>
      ]
    | [definition: WorkflowHandler<Input, Output>]
): Workflow<Name, Input, Output> {
  const [opts, definition] = args.length === 1 ? [undefined, args[0]] : args;
  const workflow: Workflow<Name, Input, Output> = ((
    input?: any,
    options?: ChildWorkflowOptions
  ) => {
    const hook = getEventualHook();
    const timeout = options?.timeout ?? opts?.timeout;
    const eventual = hook.executeEventualCall(
      createCall(CallKind.ChildWorkflowCall, {
        input,
        name,
        // if the timeout is a time or a duration, from any source, send the timeout to the child execution
        // to time itself out.
        opts: {
          timeout:
            isDurationSchedule(timeout) || isTimeSchedule(timeout)
              ? timeout
              : undefined,
        },
        // if an eventual/promise is given, even if it is a duration or a time, timeout based on the
        // promise resolution.
        // TODO: support reporting cancellation to children when the parent times out?
        timeout: timeout && "then" in timeout ? timeout : undefined,
      })
    ) as EventualPromise<Output> & ChildExecution;

    // create a reference to the child workflow started at a sequence in this execution.
    // this reference will be resolved by the runtime.
    eventual.sendSignal = function (signal, payload?) {
      const signalId = typeof signal === "string" ? signal : signal.id;
      return getEventualHook().executeEventualCall(
        createCall(CallKind.SendSignalCall, {
          payload,
          signalId,
          target: {
            type: SignalTargetType.ChildExecution,
            seq: eventual[EventualPromiseSymbol]!,
            workflowName: name,
          },
        })
      );
    };

    return eventual;
  }) as any;

  Object.defineProperty(workflow, "name", { value: name, writable: false });

  workflow.startExecution = async function (input) {
    const serviceClient =
      getEventualHook().getEventualProperty<ServiceClientProperty>(
        createEventualProperty(PropertyKind.ServiceClient, {})
      );
    return await serviceClient.startExecution<Workflow<Name, Input, Output>>({
      workflow: name,
      executionName: input.executionName,
      input: input.input,
      timeout: input.timeout,
      ...opts,
    });
  };

  // @ts-ignore
  workflow.definition = definition;
  workflow.kind = "Workflow";

  return registerEventualResource("Workflow", workflow);
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

import { ExecutionID, Schedule, Workflow } from "@eventual/core";
import {
  isTimerScheduled,
  isWorkflowRunStarted,
  isWorkflowStarted,
  Result,
  ServiceType,
  serviceTypeScope,
  TimerCompleted,
  TimerScheduled,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowInputEvent,
  WorkflowRunStarted,
  WorkflowStarted,
  WorkflowSucceeded,
  WorkflowTimedOut,
} from "@eventual/core/internal";
import type { TimerClient } from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { CommandExecutor } from "../command-executor.js";
import { hookConsole, restoreConsole } from "../console-hook.js";
import { hookDate, restoreDate } from "../date-hook.js";
import { LogAgent, LogContextType } from "../log-agent.js";
import type { ExecutorProvider } from "../providers/executor-provider.js";
import type { WorkflowProvider } from "../providers/workflow-provider.js";
import { isFailed, normalizeFailedResult } from "../result.js";
import type { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import { createEvent } from "../workflow-events.js";
import { WorkflowExecutor, WorkflowResult } from "../workflow-executor.js";
import { Orchestrator, runExecutions } from "./orchestrator.js";

export function createLocalOrchestrator(
  deps: OrchestrateDependencies
): Orchestrator {
  return (workflowTasks, baseTime = () => new Date()) => {
    return serviceTypeScope(ServiceType.OrchestratorWorker, async () => {
      console.log(workflowTasks);
      const result = await runExecutions(
        workflowTasks,
        (workflowName, executionId, events) => {
          return orchestrateExecution(
            workflowName,
            executionId,
            events,
            baseTime(),
            {
              ...deps,
            }
          );
        }
      );
      console.log(result);

      return {
        failedExecutionIds: Object.keys(result.failedExecutions),
      };
    });
  };
}

interface OrchestrateDependencies {
  commandExecutor: CommandExecutor;
  executionHistoryStore: ExecutionHistoryStore;
  executorProvider: ExecutorProvider<ExecutorContext>;
  logAgent: LogAgent;
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  workflowProvider: WorkflowProvider;
}

export interface ExecutorContext {
  date: number;
}

export async function orchestrateExecution(
  workflowName: string,
  executionId: ExecutionID,
  events: WorkflowInputEvent[],
  executionTime: Date,
  deps: OrchestrateDependencies
) {
  // get the workflow
  const workflow = deps.workflowProvider.lookupWorkflow(workflowName);

  const startEvent = events.find(isWorkflowStarted);

  // if this is the first run, there will be a start event.
  // if there is a timeout, start it
  if (startEvent?.timeoutTime) {
    // if the start event is new in this execution and had a timeout, start it
    deps.timerClient.scheduleEvent<WorkflowTimedOut>({
      schedule: Schedule.time(startEvent.timeoutTime),
      event: createEvent<WorkflowTimedOut>(
        {
          type: WorkflowEventType.WorkflowTimedOut,
        },
        new Date(startEvent.timeoutTime)
      ),
      executionId,
    });
  }

  const runStarted = createEvent<WorkflowRunStarted>(
    {
      type: WorkflowEventType.WorkflowRunStarted,
    },
    executionTime
  );

  // start event collection
  const { commandEvents, executor, flushPromise } = await eventCollectorScope(
    executionId,
    deps.executionHistoryStore,
    async (emitEvent) => {
      emitEvent(runStarted);

      // workflow could not be loaded, mark the workflow as failed and exit
      if (!workflow) {
        const error = new Error("Workflow not found");
        // mark the workflow as failed
        // emit the result event
        emitEvent(
          await persistWorkflowResult(Result.failed(error), executionTime)
        );
        return {};
      }

      // get the persisted or new instance of the executor
      const executor = await getExecutor(workflow, executionId, executionTime);
      const hasPreviousResult = !!executor.result;

      hookDate(() => executor.executionContext.date);
      hookConsole((level, data) =>
        deps.logAgent.logWithContext(
          { type: LogContextType.Execution, executionId },
          level,
          ...data
        )
      );

      const { commands, result } = await runExecutor(
        runStarted,
        events,
        executor,
        executionTime
      ).finally(() => {
        restoreDate();
        restoreConsole();
      });

      console.debug("Commands to send", JSON.stringify(commands));
      // try to execute all commands
      const commandEvents = await Promise.all(
        commands.map((command) =>
          deps.commandExecutor.executeCommand(
            workflow,
            executionId,
            command,
            executionTime
          )
        )
      );

      // register command events
      emitEvent(...commandEvents);

      // only persist results when the result is new in this run
      if (result && !hasPreviousResult) {
        emitEvent(await persistWorkflowResult(result, executionTime));
      }
      emitEvent(
        createEvent(
          { type: WorkflowEventType.WorkflowRunCompleted },
          executionTime
        )
      );

      return {
        commandEvents,
        executor,
        flushPromise: deps.logAgent.flush(),
      };
    }
  );

  if (executor) {
    await deps.executorProvider.persistExecution(
      executionId,
      [runStarted, ...(commandEvents ?? [])],
      executor
    );
  }

  await flushPromise;

  /**
   * Retrieves the previously started executor or creates a new one and starts it.
   */
  async function getExecutor(
    workflow: Workflow<any, any>,
    executionId: string,
    executionTime: Date
  ): Promise<WorkflowExecutor<any, any, ExecutorContext>> {
    return await deps.executorProvider.getExecutor(executionId, (history) => {
      return new WorkflowExecutor(
        workflow,
        history,
        { date: executionTime.getTime() },
        {
          hooks: {
            beforeApplyingResultEvent: (event, context) => {
              if (isWorkflowRunStarted(event)) {
                context.date = new Date(event.timestamp).getTime();
              }
            },
          },
        }
      );
    });
  }

  async function persistWorkflowResult(
    result: Result,
    executionTime: Date
  ): Promise<WorkflowSucceeded | WorkflowFailed> {
    if (isFailed(result)) {
      const normalizedError = normalizeFailedResult(result);
      await deps.workflowClient.failExecution({
        endTime: executionTime.toISOString(),
        executionId,
        ...normalizedError,
      });
      return createEvent<WorkflowFailed>(
        {
          type: WorkflowEventType.WorkflowFailed,
          ...normalizedError,
        },
        executionTime
      );
    } else {
      await deps.workflowClient.succeedExecution({
        endTime: executionTime.toISOString(),
        executionId,
        result: result.value,
      });
      return createEvent<WorkflowSucceeded>(
        {
          type: WorkflowEventType.WorkflowSucceeded,
          output: result.value,
        },
        executionTime
      );
    }
  }
}

async function runExecutor(
  workflowRunStartedEvent: WorkflowRunStarted,
  events: WorkflowInputEvent[],
  workflowExecutor: WorkflowExecutor<any, any, ExecutorContext>,
  executionTime: Date
) {
  // when this is the first time the workflow has been run, the workflow started event will be emitted as well.
  let workflowResult: WorkflowResult | undefined = undefined;
  // if the executor has not been started, try to start it.
  if (!workflowExecutor.isStarted()) {
    workflowResult = await workflowExecutor.start(events);
  } else {
    // run the workflow with the new events
    workflowResult = await workflowExecutor.continue(
      workflowRunStartedEvent,
      ...events.filter(
        (event): event is Exclude<typeof event, WorkflowStarted> =>
          !isWorkflowStarted(event)
      )
    );
  }

  /**
   * If the workflow has any active timers that can be completed, complete them now
   * and continue the workflow.
   */
  const syntheticTimerEvents = generateSyntheticTimerEvents(
    workflowExecutor,
    executionTime
  );

  const syntheticEventsResult =
    syntheticTimerEvents.length > 0
      ? await workflowExecutor.continue(...syntheticTimerEvents)
      : undefined;

  // merge the start and continue commands and then return.
  return {
    commands: [
      ...workflowResult.commands,
      ...(syntheticEventsResult?.commands ?? []),
    ],
    result: syntheticEventsResult?.result ?? workflowResult.result,
  };
}

function generateSyntheticTimerEvents(
  executor: WorkflowExecutor<any, any, any>,
  executionTime: Date
) {
  if (!executor.hasActiveEventuals) {
    return [];
  }
  const events = executor.historyEvents;
  const activeCompleteTimerEvents = events.filter(
    (event): event is TimerScheduled =>
      isTimerScheduled(event) &&
      executor.isEventualActive(event.seq) &&
      new Date(event.timestamp).getTime() <= executionTime.getTime()
  );
  return activeCompleteTimerEvents.map((event) =>
    createEvent<TimerCompleted>(
      { type: WorkflowEventType.TimerCompleted, seq: event.seq },
      executionTime
    )
  );
}

async function eventCollectorScope<T>(
  executionId: ExecutionID,
  eventStore: ExecutionHistoryStore,
  executor: (
    emitEvent: (...events: WorkflowEvent[]) => void
  ) => Promise<Awaited<T>>
) {
  const events: WorkflowEvent[][] = [];
  const result = await executor((..._events: WorkflowEvent[]) => {
    events.push(_events);
  });
  await eventStore.putEvents(executionId, events.flat());
  return result;
}

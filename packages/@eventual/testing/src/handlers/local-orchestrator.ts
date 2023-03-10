import { ExecutionID, Schedule, Workflow } from "@eventual/core";
import {
  CommandExecutor,
  createEvent,
  ExecutionHistoryStore,
  hookDate,
  isFailed,
  normalizeFailedResult,
  Orchestrator,
  restoreDate,
  runExecutions,
  TimerClient,
  WorkflowClient,
  WorkflowExecutor,
  WorkflowProvider,
  WorkflowResult,
} from "@eventual/core-runtime";
import {
  HistoryStateEvent,
  isWorkflowRunStarted,
  isWorkflowStarted,
  Result,
  ServiceType,
  serviceTypeScope,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowInputEvent,
  WorkflowRunStarted,
  WorkflowStarted,
  WorkflowSucceeded,
  WorkflowTimedOut,
} from "@eventual/core/internal";

export interface ExecutionExecutorProvider<Context extends any = undefined> {
  getRunningExecution(
    executionId: string
  ): Promise<WorkflowExecutor<any, any, Context> | undefined>;
  persistExecution(
    executionId: string,
    commandEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<void>;
}

export function createLocalOrchestrator(
  deps: OrchestrateDependencies
): Orchestrator {
  return (workflowTasks, baseTime = () => new Date()) => {
    return serviceTypeScope(ServiceType.OrchestratorWorker, async () => {
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

      return {
        failedExecutionIds: Object.keys(result.failedExecutions),
      };
    });
  };
}

interface OrchestrateDependencies {
  workflowProvider: WorkflowProvider;
  executorProvider: ExecutionExecutorProvider<ExecutorContext>;
  commandExecutor: CommandExecutor;
  workflowClient: WorkflowClient;
  executionHistoryStore: ExecutionHistoryStore;
  timerClient: TimerClient;
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

  // start event collection
  const [commandEvents, executor] = await eventCollectorScope(
    executionId,
    deps.executionHistoryStore,
    async (emitEvent) => {
      const runStarted = createEvent<WorkflowRunStarted>(
        {
          type: WorkflowEventType.WorkflowRunStarted,
        },
        executionTime
      );
      emitEvent(runStarted);

      // workflow could not be loaded, mark the workflow as failed and exit
      if (!workflow) {
        const error = new Error("Workflow not found");
        // mark the workflow as failed
        // emit the result event
        emitEvent(
          await persistWorkflowResult(Result.failed(error), executionTime)
        );
        return [];
      }

      // get the persisted or new instance of the executor
      const executor = await getExecutor(workflow, executionId, executionTime);
      const hasPreviousResult = !!executor.result;

      hookDate(() => executor.executionContext.date);

      const { commands, result } = await runExecutor(
        executionId,
        runStarted,
        events,
        workflow,
        executor,
        deps.timerClient
      );

      restoreDate();

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

      return [commandEvents, executor];
    }
  );

  if (executor) {
    await deps.executorProvider.persistExecution(
      executionId,
      commandEvents ?? [],
      executor
    );
  }

  /**
   * Retrieves the previously started executor or creates a new one and starts it.
   */
  async function getExecutor(
    workflow: Workflow<any, any>,
    executionId: string,
    executionTime: Date
  ): Promise<WorkflowExecutor<any, any, ExecutorContext>> {
    const runningExecutor = await deps.executorProvider.getRunningExecution(
      executionId
    );

    if (!runningExecutor) {
      // TODO hooks
      return new WorkflowExecutor(
        workflow,
        [],
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
    }

    return runningExecutor;
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
  executionId: string,
  workflowRunStartedEvent: WorkflowRunStarted,
  events: WorkflowInputEvent[],
  workflow: Workflow,
  workflowExecutor: WorkflowExecutor<any, any, ExecutorContext>,
  timerClient: TimerClient
) {
  let startResult: WorkflowResult | undefined = undefined;
  // if the executor has not been started, try to start it.
  if (!workflowExecutor.isStarted()) {
    const startEvent = events.find(isWorkflowStarted);

    if (startEvent) {
      if (startEvent.timeoutTime) {
        timerClient.scheduleEvent<WorkflowTimedOut>({
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
      startResult = await workflowExecutor.start(startEvent.input, {
        workflow: { name: workflow.name },
        execution: {
          ...startEvent.context,
          id: executionId as ExecutionID,
          startTime: startEvent.timestamp,
        },
      });
    } else {
      throw new Error(
        "No running execution was found and no StartWorkflow event was provided"
      );
    }
  }

  // if the workflow already failed, return the current result
  if (startResult && isFailed(startResult?.result)) {
    return startResult;
  }

  // run the workflow with the new events
  const continueResult = await workflowExecutor.continue(
    workflowRunStartedEvent,
    ...events.filter(
      (event): event is Exclude<typeof event, WorkflowStarted> =>
        !isWorkflowStarted(event)
    )
  );

  // merge the start and continue commands and then return.
  return {
    commands: [...(startResult?.commands ?? []), ...continueResult.commands],
    result: continueResult.result,
  };
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

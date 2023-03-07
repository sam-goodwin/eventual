import { ExecutionID, Workflow } from "@eventual/core";
import {
  CommandExecutor,
  isFailed,
  Orchestrator,
  runExecutions,
  WorkflowClient,
  WorkflowExecutor,
  WorkflowProvider,
  WorkflowResult,
} from "@eventual/core-runtime";
import {
  HistoryStateEvent,
  isWorkflowStarted,
  Result,
  ServiceType,
  serviceTypeScope,
  WorkflowInputEvent,
  WorkflowStarted,
} from "@eventual/core/internal";

interface ExecutionExecutorProvider {
  getRunningExecution(
    workflow: Workflow,
    executionId: string
  ): Promise<WorkflowExecutor<any, any> | undefined>;
  persistExecution(
    executionId: string,
    commandEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any>
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
  executionProvider: ExecutionExecutorProvider;
  commandExecutor: CommandExecutor;
  workflowClient: WorkflowClient;
}

export async function orchestrateExecution(
  workflowName: string,
  executionId: ExecutionID,
  events: WorkflowInputEvent[],
  executionTime: Date,
  deps: OrchestrateDependencies
) {
  const workflow = deps.workflowProvider.lookupWorkflow(workflowName);

  if (!workflow) {
    // TODO: fail the workflow
    throw new Error("Workflow not found");
  }

  const executor = await getExecutor(workflow, executionId);
  const hasPreviousResult = !!executor.result;

  // if the workflow is already failed, don't run it anymore...
  const { commands, result } = await runExecutor(events, workflow, executor);

  // try to execute all commands

  console.debug("Commands to send", JSON.stringify(commands));
  // register command events
  const commandEvents = await Promise.all(
    //
    commands.map((command) =>
      deps.commandExecutor.executeCommand(
        workflow,
        executionId,
        command,
        executionTime
      )
    )
  );

  // only persist results when the result is new in this run
  if (result && !hasPreviousResult) {
    await persistWorkflowResult(result);
  }

  // TODO persist history
  await deps.executionProvider.persistExecution(
    executionId,
    commandEvents,
    executor
  );

  async function runExecutor(
    events: WorkflowInputEvent[],
    workflow: Workflow,
    workflowExecutor: WorkflowExecutor<any, any>
  ) {
    let startResult: WorkflowResult | undefined = undefined;
    // if the executor has not been started, try to start it.
    if (!executor.isStarted()) {
      const startEvent = events.find(isWorkflowStarted);

      if (startEvent) {
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

  /**
   * Retrieves the previously started executor or creates a new one and starts it.
   */
  async function getExecutor(
    workflow: Workflow<any, any>,
    executionId: string
  ): Promise<WorkflowExecutor<any, any>> {
    const runningExecutor = await deps.executionProvider.getRunningExecution(
      workflow,
      executionId
    );

    if (!runningExecutor) {
      // TODO hooks
      return new WorkflowExecutor(workflow, [], { hooks: {} });
    }

    return runningExecutor;
  }

  async function persistWorkflowResult(result: Result) {
    if (isFailed(result)) {
      await deps.workflowClient.failExecution({
        endTime: executionTime,
        error: base,
      });
    }
  }
}

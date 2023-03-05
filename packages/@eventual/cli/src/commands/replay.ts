import { bundleService } from "@eventual/compiler";
import {
  DeterminismError,
  Execution,
  ExecutionID,
  isFailedExecution,
  isSucceededExecution,
} from "@eventual/core";
import {
  parseWorkflowName,
  processEvents,
  progressWorkflow,
} from "@eventual/core-runtime";
import {
  encodeExecutionId,
  isFailed,
  isResolved,
  normalizeFailedResult,
  Result,
  resultToString,
  ServiceType,
  serviceTypeScope,
  workflows,
} from "@eventual/core/internal";
import path from "path";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const replay = (yargs: Argv) =>
  yargs.command(
    "execution <execution>",
    "Replays a workflow from the events of another execution",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("execution", {
          describe: "Execution id",
          type: "string",
          demandOption: true,
        })
        .option("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        }),
    serviceAction(
      async (spinner, serviceClient, { entry, service, execution }) => {
        spinner.start("Constructing replay...");
        const [, { events }, executionObj] = await Promise.all([
          loadService(service, encodeExecutionId(execution), entry),
          serviceClient.getExecutionWorkflowHistory(execution),
          serviceClient.getExecution(execution),
        ]);

        spinner.succeed();
        const workflowName = parseWorkflowName(execution as ExecutionID);
        const workflow = workflows().get(workflowName);
        if (!workflow) {
          throw new Error(`Workflow ${workflowName} not found!`);
        }
        if (!executionObj) {
          throw new Error(`Execution ${execution} not found!`);
        }
        spinner.start("Running program");

        await serviceTypeScope(ServiceType.OrchestratorWorker, async () => {
          const processedEvents = processEvents(
            events,
            [],
            new Date(
              isSucceededExecution(executionObj) ||
              isFailedExecution(executionObj)
                ? executionObj.endTime
                : executionObj.startTime
            )
          );

          const res = await progressWorkflow(
            execution,
            workflow,
            processedEvents
          );

          assertExpectedResult(executionObj, res.result);

          spinner.succeed();
          process.stdout.write(`result: ${resultToString(res.result)}\n`);
        });
      }
    )
  );

async function loadService(
  service: string,
  encodedExecutionId: any,
  entry: string
) {
  const outDir = path.join(".eventual", "cli", service, encodedExecutionId);

  const workflowPath = await bundleService(outDir, entry);
  await import(path.resolve(workflowPath));
}

function assertExpectedResult(execution: Execution, replayResult?: Result) {
  if (isFailedExecution(execution)) {
    if (!isFailed(replayResult)) {
      throwUnexpectedResult();
    } else if (isFailed(replayResult)) {
      const { error, message } = normalizeFailedResult(replayResult);
      if (error !== execution.error || message !== execution.message) {
        throwUnexpectedResult();
      }
    }
  } else if (isSucceededExecution(execution)) {
    if (
      !isResolved(replayResult) ||
      JSON.stringify(replayResult.value) !== JSON.stringify(execution.result)
    ) {
      throwUnexpectedResult();
    }
  } else {
    if (isResolved(replayResult) || isFailed(replayResult)) {
      throwUnexpectedResult();
    }
  }

  function throwUnexpectedResult() {
    const executionResultString = isFailedExecution(execution)
      ? `${execution.error}: ${execution.message}`
      : isSucceededExecution(execution)
      ? JSON.stringify(execution.result)
      : "workflow in progress";
    throw new DeterminismError(
      `Something went wrong, execution returned a different result on replay.
  
  Expected - ${executionResultString}
  Received - ${resultToString(replayResult)}`
    );
  }
}

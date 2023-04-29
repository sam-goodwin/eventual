import {
  DeterminismError,
  Execution,
  ExecutionID,
  isFailedExecution,
  isSucceededExecution,
} from "@eventual/core";
import {
  isFailed,
  isResolved,
  normalizeFailedResult,
  parseWorkflowName,
  resultToString,
  runExecutor,
  WorkflowExecutor,
} from "@eventual/core-runtime";
import {
  Result,
  ServiceType,
  serviceTypeScope,
  workflows,
} from "@eventual/core/internal";
import { discoverEventualConfig } from "@eventual/project";
import path from "path";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { resolveManifestLocal } from "./local.js";

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
          describe:
            "Entry file, if not provided, will be resolved using the CDK synth",
          type: "string",
        }),
    serviceAction(
      async (spinner, serviceClient, { entry, execution, service }) => {
        spinner.start("Constructing replay...");
        const config = await discoverEventualConfig();

        if (!config) {
          spinner.fail("No eventual config (eventual.json) found...");
          process.exit(1);
        }

        if (!entry) {
          const buildManifest = await resolveManifestLocal(
            spinner,
            config,
            service
          );

          entry = buildManifest.entry;
        }

        const [, { events }, executionObj] = await Promise.all([
          import(path.resolve(entry)),
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
          const executor = new WorkflowExecutor<any, any, any>(
            workflow,
            events
          );

          const res = await runExecutor(executor, [], new Date());

          assertExpectedResult(executionObj, res.result);

          spinner.succeed();
          process.stdout.write(`result: ${resultToString(res.result)}\n`);
        });
      }
    )
  );

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

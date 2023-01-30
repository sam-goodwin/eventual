import { bundleService } from "@eventual/compiler";
import {
  encodeExecutionId,
  ExecutionID,
  isFailedExecution,
  isSucceededExecution,
  parseWorkflowName,
  workflows,
} from "@eventual/core";
import { processEvents, progressWorkflow } from "@eventual/runtime-core";
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

        const res = progressWorkflow(execution, workflow, processedEvents);

        spinner.succeed();
        console.log(res);
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

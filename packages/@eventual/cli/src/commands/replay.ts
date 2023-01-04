import {
  encodeExecutionId,
  ExecutionID,
  parseWorkflowName,
  ServiceType,
  SERVICE_TYPE_FLAG,
  workflows,
} from "@eventual/core";
import { Argv } from "yargs";
import { bundleService } from "@eventual/compiler";
import path from "path";
import { orchestrator } from "../replay/orchestrator.js";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const replay = (yargs: Argv) =>
  yargs.command(
    "execution",
    "Replays a workflow from the events of another execution",
    (yargs) =>
      setServiceOptions(yargs)
        .option("execution", {
          alias: "e",
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
        process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
        spinner.start("Constructing replay...");
        const [, { events }] = await Promise.all([
          loadService(service, encodeExecutionId(execution), entry),
          serviceClient.getExecutionWorkflowHistory(execution),
        ]);

        spinner.succeed();
        const workflowName = parseWorkflowName(execution as ExecutionID);
        const workflow = workflows().get(workflowName);
        if (!workflow) {
          throw new Error(`Workflow ${workflowName} not found!`);
        }
        spinner.start("Running program");

        const res = orchestrator(workflow, events);
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

import {
  encodeExecutionId,
  ExecutionID,
  HistoryStateEvent,
  parseWorkflowName,
  ServiceType,
  SERVICE_TYPE_FLAG,
} from "@eventual/core";
import { Argv } from "yargs";
import { bundleService } from "@eventual/compiler";
import path from "path";
import { orchestrator } from "../replay/orchestrator.js";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { workflows } from "@eventual/core";

export const replay = (yargs: Argv) =>
  yargs.command(
    "replay <service> <execution> <entry>",
    "List executions of a workflow",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("execution", {
          describe: "Execution id",
          type: "string",
          demandOption: true,
        })
        .positional("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        }),
    serviceAction(async (spinner, ky, { entry, service, execution }) => {
      process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
      const encodedExecutionId = encodeExecutionId(execution);
      spinner.start("Constructing replay...");
      const [, events] = await Promise.all([
        loadService(service, encodedExecutionId, entry),
        ky
          .get(`executions/${encodedExecutionId}/workflow-history`)
          .json<HistoryStateEvent[]>(),
      ]);
      // console.log(events);

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
    })
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

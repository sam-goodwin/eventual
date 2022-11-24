import { HistoryStateEvents } from "@eventual/core";
import { Argv } from "yargs";
import { apiAction, apiOptions } from "../api-action.js";
import { OuterVisitor, prepareOutDir } from "@eventual/compiler";
import path from "path";
import { orchestrator } from "../replay/orchestrator.js";
import * as swc from "@swc/core";
import fs from "fs/promises";

export const replay = (yargs: Argv) =>
  yargs.command(
    "replay <entry> <workflow> <execution>",
    "List executions of a workflow",
    (yargs) =>
      yargs
        .options(apiOptions)
        .positional("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        })
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .positional("execution", {
          describe: "Execution id",
          type: "string",
          demandOption: true,
        }),
    apiAction(async (spinner, ky, { entry, workflow, execution }) => {
      spinner.start("Getting history");
      const events = await ky
        .get(`workflows/${workflow}/executions/${execution}/workflow-history`)
        .json<HistoryStateEvents[]>();
      spinner.succeed();
      console.log(process.env.NODE_PATH);
      spinner.start("Compiling workflow");
      const workflowPath = await buildTransformedWorkflow(workflow, entry);
      spinner.succeed();
      spinner.start("Importing program");

      const { default: workflowProgram } = await import(workflowPath);
      spinner.succeed();
      spinner.start("Running program");
      //Dodgy, but vscode needs a bit of time to pick up the newly created file and sourcemap
      await sleep(500);
      const res = orchestrator(workflowProgram, events);
      spinner.succeed();
      console.log(res);
    })
  );

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Transform the user's workflow code into a generator
 * @param workflow the workflow name
 * @param entry workflow entry file
 */
async function buildTransformedWorkflow(workflow: string, entry: string) {
  const outDir = path.join(".eventual", "cli", workflow);
  const workflowCodePath = path.resolve(outDir, `${workflow}.mjs`);
  const workflowMapPath = path.resolve(outDir, `${workflow}.mjs.map`);
  //Don't try changing this to inline source maps, it breaks the program
  const { code, map } = await swc.transformFile(entry, {
    plugin: (program) => new OuterVisitor().visitProgram(program),
    sourceMaps: true,
    outputPath: path.dirname(workflowCodePath),
    jsc: {
      parser: {
        syntax:
          entry.endsWith(".ts") || entry.endsWith(".mts")
            ? "typescript"
            : "ecmascript",
      },
      //To ensure support for node 14
      target: "es2019",
    },
  });
  await prepareOutDir(outDir);
  await Promise.all([
    fs.writeFile(
      workflowCodePath,
      `${code}//# sourceMappingURL=${workflow}.mjs.map`
    ),
    fs.writeFile(workflowMapPath, map!),
  ]);
  return workflowCodePath;
}

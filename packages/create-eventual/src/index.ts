import yargs from "yargs";
import inquirer from "inquirer";
import { hideBin } from "yargs/helpers";
import { createAwsCdk } from "./aws-cdk.js";
import { createAwsSst } from "./aws-sst.js";
import { CreateProps } from "./util.js";

export type PackageManager = "npm" | "yarn" | "pnpm";

const projectNameRegex = /^[A-Za-z-_0-9]+$/g;

const targetChoices = ["aws-cdk", "aws-sst"].sort();

(async function () {
  const pkgManager: PackageManager = process.execPath.includes("npm")
    ? "npm"
    : process.execPath.includes("yarn")
    ? "yarn"
    : process.execPath.includes("pnpm")
    ? "pnpm"
    : "npm";

  await yargs(hideBin(process.argv))
    .scriptName("create-eventual")
    .command(
      "$0 [projectName]",
      "",
      (yargs) =>
        yargs
          .positional("projectName", {
            type: "string",
            description: "Name of the project to create",
          })
          .option("target", {
            type: "string",
            choices: targetChoices,
          })
          .check(({ projectName }) => {
            if (projectName !== undefined) {
              if (!projectName.match(projectNameRegex)) {
                throw new Error(`project name must match ${projectNameRegex}`);
              }
            }
            return true;
          }),
      async (args) => {
        const {
          target = args.target!,
          projectName = args.projectName!,
        }: { target: string; projectName: string } = await inquirer.prompt([
          {
            type: "input",
            name: "projectName",
            when: !args.projectName,
            message: `project name`,
            validate: (projectName: string) =>
              projectName.match(projectNameRegex) !== null ||
              `project name must match ${projectNameRegex}`,
          },
          {
            type: "list",
            name: "target",
            choices: targetChoices,
            when: !args.target,
          },
        ]);

        const props: CreateProps = {
          pkgManager,
          projectName: projectName!,
        };

        if (target === "aws-cdk") {
          await createAwsCdk(props);
        } else {
          await createAwsSst(props);
        }
      }
    )
    .parse();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

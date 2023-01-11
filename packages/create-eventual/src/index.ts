import yargs from "yargs";
import inquirer from "inquirer";
import { hideBin } from "yargs/helpers";
import { createAwsCdk } from "./aws-cdk.js";
import { createAwsSst } from "./aws-sst.js";
import { discoverPackageManager } from "./util.js";

const targetChoices = ["aws-cdk", "sst"].sort();

(async function () {
  const pkgManager = discoverPackageManager();

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
          .option("serviceName", {
            type: "string",
            description: "Name of the service to create",
          })
          .check(({ projectName, serviceName }) => {
            if (projectName) {
              assertName("project", projectName);
            }
            if (serviceName) {
              assertName("service", serviceName);
            }
            return true;
          }),
      async (args) => {
        const target = args.target ?? "aws-cdk";
        const { projectName = args.projectName! }: { projectName: string } =
          await inquirer.prompt([
            {
              type: "input",
              name: "projectName",
              when: !args.projectName,
              message: `project name`,
              validate: validateProjectName,
            },
          ]);

        if (target === "aws-cdk") {
          const { serviceName = args.serviceName! }: { serviceName: string } =
            await inquirer.prompt([
              {
                type: "input",
                name: "serviceName",
                message: "service name",
                when: !args.serviceName,
                default: args.projectName,
                validate: validateServiceName,
              },
            ]);

          await createAwsCdk({
            pkgManager,
            projectName: projectName!,
            serviceName,
          });
        } else {
          await createAwsSst({
            pkgManager,
            projectName: projectName!,
          });
        }
      }
    )
    .parse();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

const projectNameRegex = /^[A-Za-z-_0-9]+$/g;

const validateProjectName = validateName("project");
const validateServiceName = validateName("service");

function validateName(type: string) {
  return (name: string): true | string =>
    name.match(projectNameRegex) !== null ||
    `${type} name must match ${projectNameRegex}`;
}

function assertName(type: string, name: string) {
  const result = validateName(type)(name);
  if (typeof result === "string") {
    throw new Error(result);
  }
}

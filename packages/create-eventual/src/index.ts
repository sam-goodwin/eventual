import yargs from "yargs";
import inquirer from "inquirer";
import { hideBin } from "yargs/helpers";
import { createAwsCdk } from "./aws-cdk.js";
import { createAwsSst } from "./aws-sst.js";
import { discoverPackageManager } from "./util.js";
import {
  assertName,
  validateProjectName,
  validateServiceName,
} from "./validate.js";
import { createNewService } from "./new-service.js";

const targetChoices = ["aws-cdk", "aws-cdk-service", "sst"].sort();

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
        const { type = args.target! }: { type: string } = await inquirer.prompt(
          [
            {
              type: "list",
              name: "type",
              choices: [
                {
                  name: "create a new project",
                  value: "aws-cdk",
                },
                {
                  name: "add a new service",
                  value: "aws-cdk-service",
                },
              ],
            },
          ]
        );

        if (type === "aws-cdk-service") {
          await createNewService(args.serviceName);
        } else {
          const {
            projectName = args.projectName!,
          }: { type: string; projectName: string } = await inquirer.prompt([
            {
              type: "input",
              name: "projectName",
              when: !args.projectName,
              message: `project name`,
              validate: validateProjectName,
            },
          ]);
          if (type === "aws-cdk") {
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
      }
    )
    .parse();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

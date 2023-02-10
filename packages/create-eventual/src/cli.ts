import { validateServiceName } from "@eventual/project";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  createNewProject,
  ProjectType,
  validateProjectName,
} from "./create-new-project.js";

const targetChoices = [ProjectType.AWS_CDK, ProjectType.SST].sort();

(async function () {
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
            default: ProjectType.AWS_CDK,
          })
          .option("serviceName", {
            type: "string",
            description: "Name of the service to create",
          })
          .option("git", {
            type: "boolean",
            boolean: true,
            default: true,
            description: "init a git repo",
          })
          .check(({ projectName, serviceName }) => {
            if (projectName) {
              assertName("project", validateProjectName);
            }
            if (serviceName) {
              assertName("service", validateServiceName);
            }
            return true;
          }),
      async (args) => {
        console.log(args.git);
        await createNewProject({
          projectType: args.target,
          projectName: args.projectName,
          serviceName: args.serviceName,
          git: args.git,
        });
      }
    )
    .parse();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

export function assertName(
  name: string,
  validate: (name: string) => true | string
) {
  const result = validate(name);
  if (typeof result === "string") {
    throw new Error(result);
  }
}

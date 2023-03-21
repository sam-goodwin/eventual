import { discoverPackageManager } from "@eventual/project";
import inquirer from "inquirer";
import { createAwsCdkProject } from "./create-new-aws-cdk-project";
import { createSSTProject } from "./create-new-sst-project";

export enum ProjectType {
  AWS_CDK = "aws-cdk",
  SST = "sst",
}

export interface CreateNewProjectProps {
  projectName?: string;
  serviceName?: string;
  projectType?: ProjectType;
  git: boolean;
  skipInstall: boolean;
}

const projectNameRegex = /^[A-Za-z-_0-9]+$/g;

export function validateProjectName(name: string) {
  return (
    name.match(projectNameRegex) !== null ||
    `project name must match ${projectNameRegex}`
  );
}

/**
 * Creates a new Eventual Project.
 *
 * All arguments are optional and will be inquired from the user when necessary.
 */
export async function createNewProject(args: CreateNewProjectProps) {
  const pkgManager = discoverPackageManager();

  const { projectName = args.projectName! } = await inquirer.prompt<{
    projectName: string;
  }>([
    {
      type: "input",
      name: "projectName",
      when: !args.projectName,
      default: args.projectName,
      message: `project name`,
      validate: validateProjectName,
    },
  ]);

  if (args.projectType === ProjectType.SST) {
    await createSSTProject({
      pkgManager,
      projectName: projectName!,
    });
  } else {
    await createAwsCdkProject({
      pkgManager,
      projectName: projectName!,
      serviceName: args.serviceName,
      git: args.git,
      skipInstall: args.skipInstall,
    });
  }
}

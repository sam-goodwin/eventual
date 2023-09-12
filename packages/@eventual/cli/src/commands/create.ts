import { createNewService, validateServiceName } from "@eventual/project";
import inquirer from "inquirer";
import type { Argv } from "yargs";

/**
 * Creates a new Service in an Eventual-managed project.
 *
 * Interactive:
 * ```
 * npx eventual create service
 * > service name: cart-service
 * ```
 *
 * Straight shot:
 * ```
 * npx eventual create service --name cart-service
 * ```
 */
export const create = (yargs: Argv) =>
  yargs.command(
    "service",
    "Creates a new Service in your eventual project's app directory",
    (yargs) =>
      yargs.option("name", {
        describe: "Name of the new Service",
        type: "string",
      }),
    async (args) => {
      if (!args.name) {
        args.name = (
          await inquirer.prompt([
            {
              type: "input",
              name: "serviceName",
              when: !args.name,
              message: `service name`,
              validate: validateServiceName,
            },
          ])
        ).serviceName! as string;
      }

      await createNewService(args.name);
    }
  );

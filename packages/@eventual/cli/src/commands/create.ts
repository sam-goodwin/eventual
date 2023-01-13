import { createNewService } from "@eventual/project";
import { Argv } from "yargs";

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
      await createNewService(args.name);
    }
  );

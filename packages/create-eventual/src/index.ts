import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createAwsCdk } from "./aws-cdk.js";
import { createAwsSst } from "./aws-sst.js";
export type PackageManager = "npm" | "yarn" | "pnpm";

(async function () {
  const pkgManager: PackageManager = process.execPath.includes("npm")
    ? "npm"
    : process.execPath.includes("yarn")
    ? "yarn"
    : process.execPath.includes("pnpm")
    ? "pnpm"
    : "npm";

  await yargs(hideBin(process.argv))
    .demandCommand(1, "you must specify a project name")
    .command(
      "$0 <projectName>",
      "",
      (yargs) =>
        yargs
          .positional("projectName", {
            type: "string",
            description: "Name of the project to create",
          })
          .option("target", {
            type: "string",
          }),
      async (args) => {
        const props = {
          pkgManager,
          projectName: args.projectName!,
        };
        if (args.target === "aws-cdk") {
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

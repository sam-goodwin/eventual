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
    .option("target", {
      type: "string",
    })
    .command(
      "$0 [projectName]",
      "",
      (yarg) =>
        yarg.positional("projectName", {
          type: "string",
          description: "Name of the project to create",
          demandOption: true,
        }),
      async (argv) => {
        const props = {
          pkgManager,
          projectName: argv.projectName,
        };
        if (argv.target === "aws-sst") {
          await createAwsSst(props);
        } else {
          await createAwsCdk(props);
        }
      }
    ).argv;
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

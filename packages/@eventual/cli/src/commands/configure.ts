import { Argv } from "yargs";
import Table from "cli-table3";
import { defaultService } from "../env.js";

export const configure = (yargs: Argv) =>
  yargs.command(
    ["config", "configuration"],
    "Returns all configuration properties and their values",
    async () => {
      const table = new Table({
        head: ["Env", "Description", "Value"],
        colWidths: [40, 50, 20],
        wordWrap: true,
      });
      table.push([
        "EVENTUAL_DEFAULT_SERVICE",
        "Default Service used for eventual commands when --service is not provided.",
        defaultService(),
      ]);
      process.stdout.write("\n");
      process.stdout.write(table.toString());
      process.stdout.write("\n");
    }
  );

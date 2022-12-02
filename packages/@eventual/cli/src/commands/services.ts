import { Argv } from "yargs";
import * as ssm from "@aws-sdk/client-ssm";
import ora from "ora";
import { styledConsole } from "../styled-console.js";

export const services = (yargs: Argv) =>
  yargs.command(
    ["services"],
    "List Eventual services",
    (yargs) =>
      yargs.option("region", {
        alias: "r",
        describe: "Region to query",
        type: "string",
      }),
    async ({ region }) => {
      const spinner = ora("Getting services").start();
      const ssmClient = new ssm.SSMClient({ region });
      const serviceParameters = await ssmClient.send(
        new ssm.DescribeParametersCommand({
          ParameterFilters: [
            {
              Key: "Path",
              Values: ["/eventual/services/"],
            },
          ],
        })
      );
      spinner.stop();
      styledConsole.success("Services");
      serviceParameters.Parameters?.forEach((p) =>
        console.log(p.Name?.split("/eventual/services/")[1])
      );
    }
  );

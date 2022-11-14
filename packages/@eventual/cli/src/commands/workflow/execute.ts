import { Command } from "commander";
import { apiKy } from "../../api-ky.js";
import { HTTPError } from "ky";

export const execute: Command = new Command("execute")
  .description("Execute workflow")
  .argument("<name>", "Workflow name")
  .option("-r, --region <region>", "API region")
  .action(async (name, options) => {
    const ky = await apiKy(options.region);
    console.log(options, name);
    try {
      const execution = await ky.post(`workflows/${name}`).json<string[]>();
      console.log(execution);
    } catch (e) {
      console.log(e);
      if (e instanceof HTTPError) {
        console.log(await e.response.text());
      }
    }
  });

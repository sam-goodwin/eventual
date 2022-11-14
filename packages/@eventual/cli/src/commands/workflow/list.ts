import { Command } from "commander";
import { apiKy } from "../../api-ky.js";
import { HTTPError } from "ky";
export const list: Command = new Command("list")
  .description("List Eventual workflows")
  .option("-r, --region <region>", "API region")
  .action(async (options) => {
    const ky = await apiKy(options.region);
    try {
      const workflows = await ky("workflows").json<string[]>();
      workflows.forEach((w) => console.log(w));
    } catch (e) {
      console.log(e);
      if (e instanceof HTTPError) {
        console.log(await e.response.text());
      }
    }
  });

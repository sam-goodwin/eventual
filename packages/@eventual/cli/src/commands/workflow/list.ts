import { Command } from "commander";
import { withApiAction } from "../../api-action.js";

const command = new Command("list").description("List Eventual workflows");

export const list = withApiAction(command, async (ky) => {
  const workflows = await ky("workflows").json<string[]>();
  workflows.forEach((w) => console.log(w));
});

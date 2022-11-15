import { Command } from "commander";
import { withApiAction } from "../../api-action.js";

const command = new Command("status")
  .description("Get status of a workflow")
  .argument("<name>", "Workflow name");

export const status = withApiAction(command, async (ky, name) => {
  const execution = await ky.get(`workflows/${name}`).json();
  console.log(execution);
});

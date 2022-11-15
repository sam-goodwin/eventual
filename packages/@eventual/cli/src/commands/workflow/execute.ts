import { Command } from "commander";
import { withApiAction } from "../../api-action.js";

const command = new Command("execute")
  .description("Execute an Eventual workflow")
  .argument("<name>", "Workflow name");

export const execute = withApiAction(command, async (ky, name) => {
  const execution = await ky
    .post(`workflows/${name}`)
    .json<{ executionId: string }>();
  console.log(execution);
});

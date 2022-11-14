import { Command } from "commander";
import { apiKy } from "../api-ky";

export const listWorkflowsCommand: Command = new Command("list")
  .description("List Eventual workflows")
  .action(async () => {
    const ky = await apiKy();
    const workflows = await ky("/workflows").json<string[]>();
    workflows.forEach((w) => console.log(w));
  });

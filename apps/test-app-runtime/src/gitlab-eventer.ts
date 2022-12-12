import { Gitlab, GitlabEvent } from "@eventual/integrations-gitlab";
import { AWSSecret } from "@eventual/aws-runtime";
import { workflow } from "@eventual/core";
import { PipelineEvent } from "packages/@eventual/integrations-gitlab/src/index.js";

const gitlab = new Gitlab();

const { path, events } = gitlab.webhook("repo-1-hook", {
  validationToken: new AWSSecret({ secretId: process.env.REPO_1_HOOK_TOKEN! }),
});
console.log(`Github webhook installed at ${path}`);

const myWorkflow = workflow(
  "gitlab-notifier",
  async (_pipelineEvent: PipelineEvent) => {
    //do stuff here!
  }
);

events.on(async (event: GitlabEvent) => {
  if (event.object_kind === "pipeline") {
    await myWorkflow.startExecution({ input: event });
  }
});

import { Gitlab, GitlabEvent } from "@eventual/integrations-gitlab";
import { AWSSecret } from "@eventual/aws-runtime";
import { workflow } from "@eventual/core";
import { PipelineEvent } from "packages/@eventual/integrations-gitlab/src/index.js";

const myWorkflow = workflow(
  "gitlab-notifier",
  (pipelineEvent: PipelineEvent) => {
    //do stuff here!
  }
);

const gitlab = new Gitlab();
const repo1Events = gitlab.webhook("repo-1-hook", {
  validationToken: new AWSSecret({ secretId: process.env.REPO_1_HOOK_TOKEN! }),
});
repo1Events.on((event: GitlabEvent) => {
  if (event.object_kind === "pipeline") {
    myWorkflow.startExecution({ input: event });
  }
});

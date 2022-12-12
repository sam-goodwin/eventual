import { Slack, SlackCredentials } from "@eventual/integrations-slack";
import { AWSSecret } from "@eventual/aws-runtime";
import { JsonSecret } from "@eventual/core";

const slack = new Slack("my-slack-connection", {
  credentials: new JsonSecret<SlackCredentials>(
    new AWSSecret({
      secretId: process.env.SLACK_SECRET_ID!,
    })
  ),
});

slack.command("/remind-me", async (request) => {
  console.log(request);
});

import {
  Slack,
  SlackCredentials,
  MessageEventEnvelope,
} from "@eventual/integrations-slack";
import { AWSSecret } from "@eventual/aws-runtime";
import { event, JsonSecret } from "@eventual/core";

const slack = new Slack("my-slack-connection", {
  credentials: new JsonSecret<SlackCredentials>(
    new AWSSecret({
      secretId: process.env.SLACK_SECRET_ID!,
    })
  ),
});

const slackMessage = event<MessageEventEnvelope>("message");

slack.message(async ({ body, say }) => {
  await slackMessage.publish(body);

  await say("hello world");
});

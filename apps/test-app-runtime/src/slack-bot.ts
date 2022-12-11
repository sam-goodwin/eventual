import { Slack, SlackCredentials } from "@eventual/slack-integration";
import { AWSSecret } from "@eventual/aws-runtime";
import { event, JsonSecret } from "@eventual/core";
import type { EnvelopedEvent, KnownEventFromType } from "@slack/bolt";

const slack = new Slack("my-slack-connection", {
  credentials: new JsonSecret<SlackCredentials>(
    new AWSSecret({
      secretId: process.env.SLACK_SECRET_ID!,
    })
  ),
});

const slackMessage =
  event<EnvelopedEvent<KnownEventFromType<"message">>>("message");

slack.message(async ({ body, say }) => {
  await slackMessage.publish(body);

  await say("hello world");
});

import { App, aws_secretsmanager, Stack } from "aws-cdk-lib";
import * as eventual from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "slack-bot");

const slackApiKey = new aws_secretsmanager.Secret(stack, "SlackApiKey");

new eventual.Service(stack, "SlackBot", {
  entry: require.resolve("test-app-runtime/lib/slack-bot.js"),
  environment: {
    SLACK_API_KEY_ARN: slackApiKey.secretArn,
    WEBHOOK_URL:
      "https://hooks.slack.com/services/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",
  },
});

/* eslint-disable camelcase, no-new */
import { App, CfnOutput, Stack, aws_secretsmanager } from "aws-cdk-lib";
import * as eventual from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "slack-service");

const slackSecrets = new aws_secretsmanager.Secret(stack, "SlackSecrets");

const slackBot = new eventual.Service(stack, "slack-bot", {
  name: "slack-bot",
  entry: require.resolve("test-app-runtime/lib/slack-bot.js"),
  environment: {
    SLACK_SECRET_ID: slackSecrets.secretArn,
  },
});

slackSecrets.grantRead(slackBot);

new CfnOutput(stack, "open-account-api-url", {
  value: slackBot.api.gateway.apiEndpoint,
});

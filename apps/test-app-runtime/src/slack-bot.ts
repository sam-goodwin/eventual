import { Slack, SlackCredentials } from "@eventual/integrations-slack";
import { AWSSecret } from "@eventual/aws-runtime";
import {
  expectSignal,
  JsonSecret,
  sendSignal,
  sleepFor,
  workflow,
} from "@eventual/core";
import ms from "ms";

const slack = new Slack("my-slack-connection", {
  credentials: new JsonSecret<SlackCredentials>(
    new AWSSecret({
      secretId: process.env.SLACK_SECRET_ID!,
      cacheConfig: {
        enabled: false,
      },
    })
  ),
});

slack.command("/remind-me", async (request) => {
  const [time, ...message] = request.body.text.split(" ");
  if (time === undefined) {
    request.ack("command did not include the time to wait for");
    return;
  }

  const waitMs = ms(time);

  await remindMe.startExecution({
    input: {
      channel: request.body.channel_name,
      message: message.join(" "),
      waitSeconds: waitMs / 1000,
    },
  });

  request.ack("got it, i'll remind you");
});

const remindMe = workflow(
  "remindMe",
  async (request: {
    channel: string;
    message: string;
    waitSeconds: number;
  }) => {
    await sleepFor(request.waitSeconds);

    await slack.client.chat.postMessage({
      channel: request.channel,
      text: request.message,
    });
  }
);

slack.command("/assign", async (request) => {
  const { executionId } = await humanTask.startExecution({
    input: {
      task: request.command.text,
      channel: request.command.channel_name,
    },
  });

  request.ack(`task assigned, when done write '/ack ${executionId}'`);
});

const humanTask = workflow(
  "humanTask",
  async (request: { channel: string; task: string }) => {
    await expectSignal("ack");

    await slack.client.chat.postMessage({
      channel: request.channel,
      text: `Complete: ${request.task}`,
    });
  }
);

slack.command("/ack", async (request) => {
  const executionId = request.command.text;
  await sendSignal(executionId, "ack");
  request.ack();
});

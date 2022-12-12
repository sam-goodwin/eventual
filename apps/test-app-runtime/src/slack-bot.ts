import { Slack, SlackCredentials } from "@eventual/integrations-slack";
import { AWSSecret } from "@eventual/aws-runtime";
import { JsonSecret, sleepFor, workflow } from "@eventual/core";
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
  console.log(request);

  const components = request.body.text.split(" ");
  const time = components[0];
  if (time === undefined) {
    request.ack("command did not include the time to wait for");
    return;
  }
  const message = components.slice(1).join(" ");
  if (message === undefined) {
    request.ack("command did not include a message");
    return;
  }

  const waitMs = ms(time);

  await remindMe.startExecution({
    input: {
      channel: request.body.channel_name,
      message: message,
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

    debugger;
    await slack.client.chat.postMessage({
      channel: request.channel,
      text: request.message,
    });
  }
);

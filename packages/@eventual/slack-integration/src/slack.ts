import {
  IncomingWebhook,
  IncomingWebhookDefaultArguments,
} from "@slack/webhook";
import { api, Secret } from "@eventual/core";

export interface SlackProps extends IncomingWebhookDefaultArguments {
  webhookUrl: string;
  signingSecret: Secret<string>;
}

export class Slack extends IncomingWebhook {
  readonly webhookUrl: string;

  constructor(props: SlackProps) {
    super(props.webhookUrl, {});
    this.webhookUrl = props.webhookUrl;

    api.post("/_slack/events", async (request) => {
      const body = await request.json?.();
      return new Response("TODO");
    });
  }
}

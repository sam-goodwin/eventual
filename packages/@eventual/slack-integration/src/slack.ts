import {
  IncomingWebhook,
  IncomingWebhookDefaultArguments,
} from "@slack/webhook";
import { hook, Secret } from "@eventual/core";

export interface SlackProps extends IncomingWebhookDefaultArguments {
  webhookUrl: string;
  signingSecret: Secret<string>;
}

export class Slack extends IncomingWebhook {
  readonly webhookUrl: string;

  constructor(props: SlackProps) {
    super(props.webhookUrl, {});
    this.webhookUrl = props.webhookUrl;

    hook((api) => {});
  }
}

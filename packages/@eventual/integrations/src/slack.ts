import { IncomingWebhook } from "@slack/webhook";
import { hook } from "@eventual/core";

export interface SlackProps {
  webhookUrl: string;
  apiKey: string;
}

export class Slack extends IncomingWebhook {
  readonly webhookUrl: string;
  readonly apiKey: string;

  constructor(props: SlackProps) {
    super(props.webhookUrl, {});
    this.webhookUrl = props.webhookUrl;
    this.apiKey = props.apiKey;

    hook((api) => {
      api.post("/slack/webhook");
    });
  }

  public onEvent(func) {}
}

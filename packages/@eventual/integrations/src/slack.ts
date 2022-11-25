import {
  IncomingWebhook,
  IncomingWebhookResult,
  IncomingWebhookSendArguments,
} from "@slack/webhook";

export interface SlackProps {
  webhookUrl: string;
  apiKey: string;
}

export class Slack {
  readonly webhookUrl: string;
  readonly apiKey: string;
  readonly webhook: IncomingWebhook;
  constructor(props: SlackProps) {
    this.webhookUrl = props.webhookUrl;
    this.apiKey = props.apiKey;
    this.webhook = new IncomingWebhook(this.webhookUrl);
  }

  public channel(channelName: string): SlackChannel {
    return new SlackChannel(this, channelName);
  }
}

export class SlackChannel {
  constructor(readonly slack: Slack, readonly channelName: string) {}

  public onEvent() {
    throw new Error("not implemented");
  }

  public send(
    message: string | Omit<IncomingWebhookSendArguments, "channel">
  ): Promise<IncomingWebhookResult> {
    return this.slack.webhook.send(
      typeof message === "string"
        ? {
            channel: this.channelName,
            text: message,
          }
        : {
            ...message,
            channel: this.channelName,
          }
    );
  }
}

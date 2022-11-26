import { workflow } from "@eventual/core";
import { Slack } from "@eventual/integrations";

const apiKeyArn = process.env.SLACK_API_KEY_ARN!;
const webhookUrl = process.env.WEBHOOK_URL!;

new Slack({
  apiKey: apiKeyArn,
  webhookUrl,
});

export const customerLifecycle = workflow("customer-lifecycle", async () => {
  // ...
});

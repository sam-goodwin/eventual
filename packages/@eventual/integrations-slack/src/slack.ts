import {
  activity,
  api,
  isOrchestratorWorker,
  Secret,
  HttpHandler,
} from "@eventual/core";
import slack from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import FetchReceiver from "./receiver.js";

export interface SlackCredentials {
  /**
   * The bot's token used to authenticate and authorize requests.
   *
   * @see https://api.slack.com/authentication/token-types
   */
  token: string;
  /**
   * The Signing Secret used to verify the a request from slack is authentic.
   *
   * @see https://api.slack.com/authentication/verifying-requests-from-slack
   */
  signingSecret: string;
}

export interface SlackProps
  extends Omit<slack.AppOptions, "token" | "signingSecret"> {
  credentials: Secret<SlackCredentials>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Slack extends slack.App {}

/**
 * The {@link Slack} class provides an integration into the Slack service.
 *
 * It can be used to subscribe to events from a Slack workspace or to
 * call Slack APIs from within an API, event, workflow or activity.
 *
 * ```ts
 * // ex. subscribe to message events from slack
 * slack.message(async ({ body, say }) => {
 *   // do something when a message is sent
 *   await say("hello world");
 * });
 *
 * // ex. post a message to the slack API from within a workflow
 * const myWorkflow = workflow("my-workflow", async () => {
 *   await slack.client.chat.postMessage({
 *     channel: "channel-name",
 *     text: "hello world!",
 *   });
 * });
 * ```
 *
 * Eventual's slack integration is built on top of the official
 * [Bolt-JS framework](https://slack.dev/bolt-js/concepts) provided by
 * Slack. For example, the `slack.message` hook is identical to the
 * `app.message `concept from Bolt.
 *
 * To learn more about the different capabilities, we recommend reviewing
 * their [Getting Started Guide](https://slack.dev/bolt-js/tutorial/getting-started).
 */
export class Slack {
  private fetchReceiver: FetchReceiver | undefined;
  private app: slack.App | undefined;
  private handler: HttpHandler | undefined;
  private deferred: [name: string, args: any[]][] = [];

  constructor(readonly name: string, readonly props: SlackProps) {
    const slackActivity = activity(
      `slack.client.${name}`,
      async ({
        propertyChain,
        args,
      }: {
        propertyChain: string[];
        args: any[];
      }) => {
        this.client = await this.getClient();
        let f: any = this.client;
        for (const prop of propertyChain) {
          f = f[prop];
        }
        return f(...args);
      }
    );

    api.all(`/_slack/${name}`, async (request) => {
      return (await this.getHandler())(request);
    });

    const deferMethodNames = new Set([
      "action",
      "command",
      "error",
      "event",
      "message",
      "options",
      "shortcut",
      "use",
      "view",
    ]);

    let proxyClient;

    return new Proxy(this, {
      get: (_, prop) => {
        if (typeof prop === "string" && deferMethodNames.has(prop)) {
          return (...args: any[]) => {
            if (this.app === undefined) {
              this.deferred.push([prop, args]);
            } else {
              (this.app[prop as keyof typeof this.app] as any)(...args);
            }
            return undefined;
          };
        } else if (prop === "client") {
          if (this.client === undefined || isOrchestratorWorker()) {
            // if we're in the orchestrator, then we need to proxy all client
            // operations through a durable activity worker request
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return (proxyClient ??= proxy(function () {}, []));
          } else {
            return this.client;
          }
        } else if (this.app === undefined) {
          throw new Error(`cannot access App properties during initialization`);
        } else {
          const value: any = this.app[prop as keyof typeof this.app];
          if (typeof value === "function") {
            return value.bind(this.app);
          } else {
            return value;
          }
        }

        /**
         * Recursively creates a {@link Proxy} that accumulates an array
         * of all properties accessed on the client, e.g.
         * ```
         * client.a.b.c => ["a", "b", "c"]
         * ```
         *
         * When the method is finally called, these properties are passed
         * as request parameters to the {@link slackActivity}.
         *
         * That activity then de-references the properties and makes the
         * call from within the durable activity request.
         */
        function proxy(instance: any, propertyChain: string[]): any {
          return new Proxy(instance, {
            apply: (_target, _this, args) =>
              slackActivity({
                propertyChain,
                args,
              }),
            get: (_, prop: string) => {
              return proxy(instance, [...propertyChain, prop]);
            },
          });
        }
      },
    });
  }

  private async getClient(): Promise<WebClient> {
    return new WebClient((await this.props.credentials.getSecret()).token, {
      // TODO: allow all properties
      agent: this.props.agent,
      logger: this.props.logger,
      logLevel: this.props.logLevel,
      slackApiUrl: this.props.clientOptions?.slackApiUrl,
    });
  }

  private async getHandler(): Promise<HttpHandler> {
    if (!this.app) {
      const { token, signingSecret } = await this.props.credentials.getSecret();
      this.fetchReceiver = new FetchReceiver({
        signingSecret,
      });
      this.app = new slack.App({
        ...this.props,
        token,
        signingSecret,
        socketMode: false,
        receiver: this.fetchReceiver,
      });
      for (const deferred of this.deferred) {
        // fire off all the deferred methods
        (this.app[deferred[0] as keyof typeof this.app] as any)(...deferred[1]);
      }
      this.handler = await this.fetchReceiver.start();
    }
    return this.handler!;
  }
}

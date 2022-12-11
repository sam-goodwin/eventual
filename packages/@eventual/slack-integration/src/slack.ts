import {
  activity,
  api,
  isOrchestratorWorker,
  RouteHandler,
  Secret,
} from "@eventual/core";
import { App, AppOptions } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import IttyReceiver from "./receiver";

export interface SlackCredentials {
  token: string;
  signingSecret: string;
}

export interface SlackProps
  extends Omit<AppOptions, "token" | "signingSecret"> {
  credentials: Secret<SlackCredentials>;
}

export interface Slack extends App {}

export class Slack {
  private ittyReceiver: IttyReceiver | undefined;
  private app: App | undefined;
  private handler: RouteHandler | undefined;
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
        // @ts-ignore - client identifier referenced in eval
        const client = await this.getClient();
        return eval(`client.${propertyChain.join(".")}`)(...args);
      }
    );

    api.all(`/_slack/${name}/events`, async (request) => {
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
        } else if (this.app === undefined) {
          throw new Error(`cannot access App properties during initialization`);
        } else if (prop === "client" && isOrchestratorWorker()) {
          // if we're in the orchestrator, then we need to proxy all client
          // operations through a durable activity worker request
          return (proxyClient ??= proxy(this.app.client, []));

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
              apply: (_target, _this, args) => {
                return slackActivity({
                  propertyChain,
                  args,
                });
              },
              get: (_, prop: string) => {
                return proxy(instance[prop], [...propertyChain, prop]);
              },
            });
          }
        } else {
          const value = this.app[prop as keyof typeof this.app];
          if (typeof value === "function") {
            return value.bind(this.app);
          } else {
            return value;
          }
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

  private async getHandler(): Promise<RouteHandler> {
    if (!this.app) {
      const { token, signingSecret } = await this.props.credentials.getSecret();
      this.ittyReceiver = new IttyReceiver({
        signingSecret,
      });
      this.app = new App({
        ...this.props,
        token,
        signingSecret,
        socketMode: false,
        receiver: this.ittyReceiver,
      });
      for (const deferred of this.deferred) {
        // fire off all the deferred methods
        (this.app[deferred[0] as keyof typeof this.app] as any)(...deferred[1]);
      }
      this.handler = await this.ittyReceiver.start();
    }
    return this.handler!;
  }
}
import { api, event, Secret, Event } from "@eventual/core";
import { GitlabEvent } from "./events/index.js";

export interface WebhookProps {
  validationToken?: Secret<string>;
}

export type WebhookHandler = (event: GitlabEvent) => void;

export class Gitlab {
  constructor() {}

  /**
   * Listen for webhook events at /_gitlab/webhook/{name}
   * @param name Name of the hook. Influences path mapping.
   * @param props.validationToken If provided, will not process the hook when the token doesn't match the webhooks' header token
   * @returns Path the hook has been mapped to, and event bus for received hook events
   */
  webhook(
    name: string,
    props?: WebhookProps
  ): { path: string; events: Event<GitlabEvent> } {
    const events = event<GitlabEvent>(name);
    const path = `/_gitlab/webhook/${name}`;
    api.post(path, async (req) => {
      //Validate the webhook against our token, if provided
      if (
        props?.validationToken &&
        (await props.validationToken.getSecret()) !==
          req.headers.get("x-gitlab-token")
      ) {
        //Even though we fail the hook, we'll return status 200 to prevent gitlab from retrying
        //TODO need a way to silently get the execution logger
        console.log("Invalid token received on webhook!");
        return new Response("Verification failed");
      }
      events.publish((await req.json()) as GitlabEvent);
      return new Response("Ok");
    });
    return { path, events };
  }
}

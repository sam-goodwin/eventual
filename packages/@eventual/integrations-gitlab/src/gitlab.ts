import { api, event, Secret, Event } from "@eventual/core";
import { GitlabEvent } from "./events/index.js";

export interface WebhookProps {
  validationToken?: Secret<string>;
}

export type WebhookHandler = (event: GitlabEvent) => void;

export class Gitlab {
  constructor() {}

  webhook(name: string, props?: WebhookProps): Event<GitlabEvent> {
    const gitlabEvents = event<GitlabEvent>(name);
    api.post(`/_gitlab/webhook/${name}`, async (req) => {
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
      gitlabEvents.publish((await req.json()) as GitlabEvent);
      return new Response("Ok");
    });
    return gitlabEvents;
  }
}

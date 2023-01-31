import { Logger, ConsoleLogger, LogLevel } from "@slack/logger";
import querystring from "querystring";
import crypto from "crypto";
import tsscmp from "tsscmp";
import {
  App,
  Receiver,
  ReceiverEvent,
  ReceiverMultipleAckError,
} from "@slack/bolt";
import { ApiRequest, RouteHandler } from "@eventual/core";

export interface FetchReceiverOptions {
  signingSecret: string;
  logger?: Logger;
  logLevel?: LogLevel;
}

/**
 * Receiver implementation for itty-router
 *
 * Note that this receiver does not support Slack OAuth flow.
 * For OAuth flow endpoints, deploy another Lambda function built with ExpressReceiver.
 *
 * Forked from AwsLambdaReceiver
 *
 * @see https://github.com/slackapi/bolt-js/blob/main/src/receivers/AwsLambdaReceiver.ts
 */
export default class FetchReceiver implements Receiver {
  private signingSecret: string;

  private app?: App;

  private logger: Logger;

  constructor({
    signingSecret,
    logger = undefined,
    logLevel = LogLevel.INFO,
  }: FetchReceiverOptions) {
    // Initialize instance variables, substituting defaults for each value
    this.signingSecret = signingSecret;
    this.logger =
      logger ??
      (() => {
        const defaultLogger = new ConsoleLogger();
        defaultLogger.setLevel(logLevel);

        return defaultLogger;
      })();
  }

  public init(app: App): void {
    this.app = app;
  }

  public start(): Promise<RouteHandler> {
    return Promise.resolve(this.handle.bind(this));
  }

  public stop(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public async handle(request: ApiRequest): Promise<Response> {
    this.logger.debug(`Request: ${JSON.stringify(request, null, 2)}`);

    const rawBody = await this.getRawBody(request);
    const body: any = this.parseRequestBody(
      rawBody,
      request.headers["Content-Type"] ??
        request.headers["content-type"] ??
        undefined,
      this.logger
    );

    // ssl_check (for Slash Commands)
    if (
      typeof body !== "undefined" &&
      body != null &&
      typeof body.ssl_check !== "undefined" &&
      body.ssl_check != null
    ) {
      return new Response("", { status: 200 });
    }

    // request signature verification
    const signature = request.headers["X-Slack-Signature"] as string;
    const ts = Number(request.headers["X-Slack-Request-Timestamp"]);
    if (
      !this.isValidRequestSignature(this.signingSecret, rawBody, signature, ts)
    ) {
      this.logger.info(
        `Invalid request signature detected (X-Slack-Signature: ${signature}, X-Slack-Request-Timestamp: ${ts})`
      );
      return new Response("", { status: 401 });
    }

    // url_verification (Events API)
    if (
      typeof body !== "undefined" &&
      body != null &&
      typeof body.type !== "undefined" &&
      body.type != null &&
      body.type === "url_verification"
    ) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Setup ack timeout warning
    let isAcknowledged = false;
    const noAckTimeoutId = setTimeout(() => {
      if (!isAcknowledged) {
        this.logger.error(
          "An incoming event was not acknowledged within 3 seconds. " +
            "Ensure that the ack() argument is called in a listener."
        );
      }
    }, 3001);

    // Structure the ReceiverEvent
    let storedResponse;
    const retryNum = request.headers["X-Slack-Retry-Num"];
    const event: ReceiverEvent = {
      body,
      ack: async (response) => {
        if (isAcknowledged) {
          throw new ReceiverMultipleAckError();
        }
        isAcknowledged = true;
        clearTimeout(noAckTimeoutId);
        if (typeof response === "undefined" || response == null) {
          storedResponse = "";
        } else {
          storedResponse = response;
        }
      },
      retryNum: retryNum ? Number(retryNum) : undefined,
      retryReason: request.headers["X-Slack-Retry-Reason"] ?? undefined,
    };

    // Send the event to the app for processing
    try {
      await this.app?.processEvent(event);
      if (storedResponse !== undefined) {
        if (typeof storedResponse === "string") {
          return new Response(storedResponse, {
            status: 200,
          });
        }
        return new Response(JSON.stringify(storedResponse), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
    } catch (err) {
      this.logger.error(
        "An unhandled error occurred while Bolt processed an event"
      );
      this.logger.debug(
        `Error details: ${err}, storedResponse: ${storedResponse}`
      );
      return new Response("Internal server error", {
        status: 500,
      });
    }
    this.logger.info(
      `No request handler matched the request: ${new URL(request.url).pathname}`
    );
    return new Response("", {
      status: 404,
    });
  }

  private async getRawBody(request: ApiRequest): Promise<string> {
    return (await request.text?.()) ?? "";
  }

  private parseRequestBody(
    stringBody: string,
    contentType: string | undefined,
    logger: Logger
  ): any {
    if (contentType === "application/x-www-form-urlencoded") {
      const parsedBody = querystring.parse(stringBody);
      if (typeof parsedBody.payload === "string") {
        return JSON.parse(parsedBody.payload);
      }
      return parsedBody;
    }
    if (contentType === "application/json") {
      return JSON.parse(stringBody);
    }

    logger.warn(`Unexpected content-type detected: ${contentType}`);
    try {
      // Parse this body anyway
      return JSON.parse(stringBody);
    } catch (e) {
      logger.error(
        `Failed to parse body as JSON data for content-type: ${contentType}`
      );
      throw e;
    }
  }

  private isValidRequestSignature(
    signingSecret: string,
    body: string,
    signature: string,
    requestTimestamp: number
  ): boolean {
    if (!signature || !requestTimestamp) {
      return false;
    }

    // Divide current date to match Slack ts format
    // Subtract 5 minutes from current time
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (requestTimestamp < fiveMinutesAgo) {
      return false;
    }

    const hmac = crypto.createHmac("sha256", signingSecret);
    const [version, hash] = signature.split("=");
    hmac.update(`${version}:${requestTimestamp}:${body}`);
    if (!tsscmp(hash!, hmac.digest("hex"))) {
      return false;
    }

    return true;
  }
}

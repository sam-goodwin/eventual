import { HttpMethod } from "@eventual/core";
import { getRequestHandler } from "./request-handler/factory.js";
import {
  BeforeRequest,
  RequestHandler,
} from "./request-handler/request-handler.js";

export interface HttpServiceClientProps {
  /**
   * Https URL provided by the eventual service on deployment.
   */
  serviceUrl: string;
  /**
   * Optional hook which allows the mutation of a request before being sent.
   *
   * Can be used to provide authorization, common headers, or signing requests.
   */
  beforeRequest?: BeforeRequest;
}

export class HttpServiceClient {
  protected readonly baseUrl: URL;
  protected requestHandler: RequestHandler;

  constructor(props: HttpServiceClientProps) {
    this.baseUrl = new URL(props.serviceUrl);
    this.requestHandler = getRequestHandler(props.beforeRequest);
  }

  public async rpc<Payload = any, Resp = any>(request: {
    payload: Payload;
    command: string;
    /**
     * @default _default
     */
    namespace: string;
  }): Promise<Resp> {
    try {
      const r = await this.request({
        path: `_rpc/${request.namespace}/${request.command}`,
        body: request.payload,
        method: "POST",
      });

      console.log(r);

      return r;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  public async request<Body = any, Resp = any>(request: {
    body?: Body;
    method: HttpMethod;
    path: string;
  }): Promise<Resp> {
    const url = `${this.baseUrl.href}${request.path}`;
    return this.requestHandler.request({
      url,
      body: request.body ? JSON.stringify(request.body) : undefined,
      headers: { "Content-Type": "application/json" },
      method: request.method,
    });
  }
}

import { HttpMethod, HttpRequestInit } from "@eventual/core";
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

  /**
   * Pass through any http request to the eventual endpoint.
   *
   * Does not inject the _eventual suffix into the url. ([serviceUrl]/[path]).
   */
  protected async proxy(
    request: Omit<HttpRequestInit, "params"> & { path: string }
  ) {
    return this.requestHandler.request({
      url: `${this.baseUrl.href}/${request.path}`,
      method: request.method,
      body: request.body,
      headers: request.headers,
    });
  }

  protected async request<Body = any, Resp = any>(request: {
    body?: Body;
    method: HttpMethod;
    path: string;
  }): Promise<Resp> {
    const url = `${this.baseUrl.href}_eventual/${request.path}`;
    return this.requestHandler.request({
      url,
      body: request.body ? JSON.stringify(request.body) : undefined,
      headers: { "Content-Type": "application/json" },
      method: request.method,
    });
  }
}

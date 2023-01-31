import { ApiRequest } from "@eventual/core";

export abstract class RequestHandler {
  constructor(private beforeRequest?: BeforeRequest) {}

  public async request<Resp = any>(req: ApiRequest): Promise<Resp> {
    return this._request(
      this.beforeRequest ? await this.beforeRequest(req) : req
    );
  }

  protected abstract _request<Resp = any>(request: ApiRequest): Promise<Resp>;
}

export type HttpMethod = "POST" | "GET" | "PUT";

export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: string
  ) {
    super(body || statusText);
  }
}

export interface BeforeRequest {
  (request: ApiRequest): Promise<ApiRequest>;
}

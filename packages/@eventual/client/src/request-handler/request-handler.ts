import { RawHttpRequest } from "@eventual/core";

export abstract class RequestHandler {
  constructor(private beforeRequest?: BeforeRequest) {}

  public async request<Resp = any>(req: RawHttpRequest): Promise<Resp> {
    return this._request(
      this.beforeRequest ? await this.beforeRequest(req) : req
    );
  }

  protected abstract _request<Resp = any>(
    request: RawHttpRequest
  ): Promise<Resp>;
}

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
  (request: RawHttpRequest): Promise<RawHttpRequest>;
}

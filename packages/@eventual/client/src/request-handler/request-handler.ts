export abstract class RequestHandler {
  constructor(private beforeRequest?: BeforeRequest) {}

  public async request<Resp = any>(req: ApiRequest): Promise<Resp> {
    return this._request(
      this.beforeRequest ? await this.beforeRequest(req) : req
    );
  }

  protected abstract _request<Resp = any>(request: HttpRequest): Promise<Resp>;
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
  (request: HttpRequest): Promise<HttpRequest>;
}

interface ApiRequest extends Request {}

export interface HttpRequest<Body = any> {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: Body;
}

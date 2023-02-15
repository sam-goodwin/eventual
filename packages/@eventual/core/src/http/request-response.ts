import type { Readable } from "node:stream";
import type { HttpMethod } from "../http-method.js";

type Body = string | Buffer | Readable | null;

abstract class BaseHttpPayload {
  abstract readonly body: string | Buffer | Readable | null;

  async tryJson(): Promise<any> {
    try {
      return await this.json();
    } catch {
      return undefined;
    }
  }

  async json() {
    return JSON.parse((await this.text?.()) ?? "");
  }

  async text(): Promise<string> {
    if (this.body === undefined) {
      return "";
    } else if (typeof this.body === "string") {
      return this.body;
    } else if (Buffer.isBuffer(this.body)) {
      // TODO: is this risky? Should we just fail whenever it's a base64 encoded buffer?
      // Or ... is this the best way to best-effort parse a buffer as JSON?
      return this.body.toString("utf-8");
    } else {
      return Buffer.from((await readStream(this.body)).buffer).toString(
        "utf-8"
      );
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.body === undefined) {
      return new ArrayBuffer(0);
    } else if (typeof this.body === "string") {
      return Buffer.from(this.body, "utf8");
    } else if (Buffer.isBuffer(this.body)) {
      return this.body;
    } else {
      return readStream(this.body);
    }
  }
}

export interface HttpRequestInit {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string | Buffer | null;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
}

export class HttpRequest extends BaseHttpPayload {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Headers;
  readonly body: string | Buffer | null;
  readonly params: Record<string, string>;
  readonly query?: Record<string, string | string[]>;

  constructor(url: string, props: HttpRequestInit) {
    super();
    const _url = new URL(url);
    this.method = props.method;
    this.headers = toHeaders(props.headers);
    this.body = props.body ?? null;
    if (props.query) {
      this.query = props.query;
    } else {
      const query: Record<string, string | string[]> = {};
      _url.searchParams.forEach((value, key) => {
        query[key] = value.includes(",") ? value.split(",") : value;
      });
      this.query = query;
    }
    this.params = props.params ?? {};
    this.url = _url.href;
  }
}

export interface RawHttpResponseInit {
  status: number;
  statusText?: string;
  headers?: Record<string, string> | Headers;
}

export class HttpResponse extends BaseHttpPayload {
  readonly body: Body;
  readonly status: number;
  readonly statusText?: string;
  readonly headers: Headers;
  constructor(body?: Body, init?: RawHttpResponseInit) {
    super();
    this.body = body === undefined ? null : body;
    this.status = init?.status ?? 200;
    this.statusText = init?.statusText;
    this.headers = toHeaders(init?.headers);
  }
}

function toHeaders(headers?: Record<string, string> | Headers): Headers {
  if (headers === undefined) {
    return new Headers();
  } else if (headers instanceof Headers) {
    return headers;
  } else {
    const h = new Headers();
    for (const [k, v] of Object.entries(headers)) {
      h.set(k, v);
    }
    return h;
  }
}

async function readStream(readable?: Readable | null): Promise<Buffer> {
  if (!readable) {
    return Buffer.from(new Uint8Array(0));
  }

  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    readable.on("error", reject);
    readable.on("data", (data) => {
      chunks.push(data);
    });
    readable.on("close", () => resolve(Buffer.concat(chunks)));
  });
}

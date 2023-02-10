import type { Status } from "@tshttp/status";

export type HttpStatusCode = Status;

export function isHttpError(err: any): err is HttpError {
  return err && typeof err === "object" && err.kind === "HttpError";
}

export class HttpError<Data = any> {
  readonly kind = "HttpError";

  readonly code;
  readonly message;
  readonly data;
  constructor(props: { code: HttpStatusCode; message: string; data?: Data }) {
    this.code = props.code;
    this.message = props.message;
    this.data = props.data;
  }
}

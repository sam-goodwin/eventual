export interface HttpRequest {
  url: string;
  method: string;
  body?: string | Buffer | null;
  headers?: Record<string, string>;
}

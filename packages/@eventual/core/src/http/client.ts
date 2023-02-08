export type HttpClient<Service> = {
  [k in keyof Pick<
    Service,
    KeysOfType<Service, { kind: "Command" }>
  >]: Service[k] extends {
    handler: infer Handler extends (...args: any[]) => any;
  }
    ? (...args: Parameters<Handler>) => Promise<Awaited<ReturnType<Handler>>>
    : never;
};

export interface HttpClientProps {}

export const HttpClient: {
  new <Service>(endpoint: string): HttpClient<Service>;
} = class HttpClient {
  constructor(readonly endpoint: string) {}
} as any;

type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

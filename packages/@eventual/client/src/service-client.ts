import {
  HttpServiceClient,
  HttpServiceClientProps,
} from "./base-http-client.js";

export type ServiceClient<Service> = {
  [k in keyof Pick<
    Service,
    KeysOfType<Service, { kind: "Command" }>
  >]: Service[k] extends {
    handler: infer Handler extends (...args: any[]) => any;
  }
    ? (...args: Parameters<Handler>) => Promise<Awaited<ReturnType<Handler>>>
    : never;
};

type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

export interface ServiceClientProps {}

export const ServiceClient: {
  new <Service>(props: HttpServiceClientProps): ServiceClient<Service>;
} = class ServiceClient extends HttpServiceClient {
  constructor(props: HttpServiceClientProps) {
    super(props);

    return mixinServiceClient.call(this);
  }
} as any;

export function mixinServiceClient(this: HttpServiceClient) {
  return new Proxy(this, {
    get: (_, commandName: string) => (input: any) =>
      this.request({
        path: `/_rpc/${commandName}`,
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

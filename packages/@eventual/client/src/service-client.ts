import { Command } from "@eventual/core";
import {
  HttpServiceClient,
  HttpServiceClientProps,
} from "./base-http-client.js";

export interface ServiceClientProps {}

/**
 * A generic client for any Service created with Eventual.
 *
 * Any command exported from your service's `index.ts` (root) can automatically be called
 * via the Service CLient. For example, if your `index.st` exports a single command:
 * ```ts
 * // given an `index.ts` of:
 * export const myCommandName = command("myCommandName", async (input: { key: string; }) => {
 *   // ...
 * });
 * ```
 *
 * Then, you can import the type of that service into your application code and instantiate
 * a client which will support invoking those commands over HTTP.
 *
 * ```ts
 *
 * // importing it into
 * import type myService from "my-service-module-name";
 *
 * const client = new ServiceClient<typeof myService>({
 *   serviceUrl: "https://.."
 * });
 *
 * // all type-safe and automatically wired
 * const result = await client.myCommandName({
 *   key: "value"
 * });
 * ```
 */
export const ServiceClient: {
  new <Service>(
    props: HttpServiceClientProps,
    rpcNamespace?: string
  ): ServiceClient<Service>;
} = class ServiceClient {
  public httpClient: HttpServiceClient;
  constructor(props: HttpServiceClientProps, rpcNamespace?: string) {
    this.httpClient = new HttpServiceClient(props);

    return proxyServiceClient.call(this, rpcNamespace);
  }
} as any;

/**
 * Creates a Proxy client that dispatches commands over HTTP to an
 * Eventual Service. The Proxy assumes the method name is the command
 * name when crafting the request to the service's `/rpc[/${namespace}]/${commandName}`
 * endpoint.
 *
 * Types then enforce that your client is calling commands by the right name
 * and input/output contract.
 */
export function proxyServiceClient(
  this: { httpClient: HttpServiceClient },
  namespace?: string
) {
  return new Proxy(this, {
    get: (_, commandName: string) => (input: any) => {
      return this.httpClient.rpc({
        command: commandName,
        payload: input,
        namespace,
      });
    },
  });
}

export type ServiceClient<Service> = {
  // first, pluck the methods where the exported name and the string name are the same
  // these we want to use direct pick so that the type-level connection is maintained
  // this gives us jump to definition from client.method to export const method = command()
  // it also carries forward documentation on the method declaration
  [k in keyof Pick<Service, KeysWhereNameIsSame<Service>>]: ServiceClientMethod<
    Service[k]
  >;
} & {
  // second, if the method's string name differs from the exported name, then transform
  // from the exported name into the command literal name
  // this is a fall back as it loses the aforementioned links
  // we still get type-safety but no jump to definition or carry-forward of docs from
  // the command declaration
  // those features will still work for the input passed into the command, but not the
  // command itself.
  [k in keyof Pick<
    Service,
    KeysWhereNameIsDifferent<Service>
  > as ServiceClientName<Service[k]>]: ServiceClientMethod<Service[k]>;
};

type ServiceClientName<T> = T extends { name: infer Name extends string }
  ? Name
  : never;

type ServiceClientMethod<T> = T extends Command<
  any,
  infer Input,
  infer Output,
  any,
  any,
  any
>
  ? [Input] extends [undefined]
    ? {
        (
          input?: Input,
          options?: {
            headers: Record<string, string>;
          }
        ): Promise<Awaited<Output>>;
      }
    : {
        (
          input: Input,
          options?: {
            headers: Record<string, string>;
          }
        ): Promise<Awaited<Output>>;
      }
  : never;

type KeysWhereNameIsSame<Service> = {
  [k in keyof Service]: k extends Extract<Service[k], { name: string }>["name"]
    ? // we only want commands to show up
      Service[k] extends { kind: "Command" }
      ? k
      : never
    : never;
}[keyof Service];

type KeysWhereNameIsDifferent<Service> = Exclude<
  KeysOfType<Service, { kind: "Command" }>,
  KeysWhereNameIsSame<Service>
>;

type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

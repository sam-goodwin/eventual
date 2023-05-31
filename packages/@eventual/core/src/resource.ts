import { Execution } from "./execution.js";

export interface Resource<ID extends string, Attributes, Client> {
  kind: "Resource";
  id: ID;
  client: Client;
  attributes: Attributes;
}

export function resource<
  const ID extends string,
  const Properties,
  const Attributes,
  const Client
>(
  id: ID,
  options: {
    create(request: Properties): Promise<Execution<Attributes> | Attributes>;
    update(request: {
      oldResourceProperties: Properties;
      newResourceProperties: Properties;
      attributes: Serialized<Attributes>;
    }): Promise<Execution<Attributes> | Attributes>;
    delete(request: {
      properties: Properties;
      attributes: Serialized<Attributes>;
    }): Promise<Execution<void> | void>;
    init(output: Serialized<Attributes>): Promise<Client>;
  }
): (id: string, props: Properties) => Resource<ID, Attributes, Client> {
  return {
    kind: "Resource",
    id,
    options,
  } as any;
}

export type Serialized<T> = T extends
  | undefined
  | null
  | boolean
  | number
  | string
  ? T
  : T extends readonly any[]
  ? {
      [i in keyof T]: i extends number ? Serialized<T[i]> : T[i];
    }
  : T extends Record<string, any>
  ? Omit<
      {
        [k in keyof T]: T[k] extends (...args: any[]) => any
          ? never
          : Serialized<T[k]>;
      },
      {
        [k in keyof T]: T[k] extends (...args: any[]) => any ? k : never;
      }[keyof T]
    >
  : never;

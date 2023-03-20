import { Attributes, entity, Entity, EntityIndex } from "@eventual/core";
import { z } from "zod";

import * as electrodb from "electrodb";

export interface StreamChange<Entity> {
  old?: Entity;
  new: Entity;
}

export interface Stream<Name extends string, Entity> {
  name: Name;
  handler: (changes: StreamChange<Entity>[]) => Promise<void>;
}

export interface Table<Name extends string, Entities extends Entity[]> {
  name: Name;
  entities: Entities;
  client: Client<Entities>;
  stream<Name extends string>(
    name: Name,
    handler: (
      entity: StreamChange<z.infer<Entities[number]["schema"]>>
    ) => Promise<void>
  ): any;
}

type IndexNames<Index extends EntityIndex<Attributes>> =
  | Index["partition"][number]
  | Exclude<Index["range"], undefined>[number];

type ToElectroAttribute<A extends z.ZodType> = A extends z.ZodOptional<infer T>
  ? Omit<ToElectroAttribute<T>, "required"> & {
      required: false;
    }
  : A extends z.ZodBoolean
  ? {
      type: "boolean";
      required: true;
    }
  : A extends z.ZodNumber
  ? {
      type: "number";
      required: true;
    }
  : A extends z.ZodString | z.ZodDate
  ? {
      type: "string";
      required: true;
    }
  : A extends z.ZodSet<z.ZodString | z.ZodDate>
  ? electrodb.StringSetAttribute & { required: true }
  : A extends z.ZodSet<z.ZodNumber>
  ? electrodb.NumberSetAttribute & { required: true }
  : A extends z.ZodArray<z.ZodString | z.ZodOptional<z.ZodString>>
  ? electrodb.StringListAttribute & { required: true }
  : A extends z.ZodArray<z.ZodNumber | z.ZodOptional<z.ZodNumber>>
  ? electrodb.NumberListAttribute & { required: true }
  : A extends z.ZodArray<z.ZodObject<infer Props> | z.ZodObject<infer Props>>
  ? electrodb.MapListAttribute & {
      required: true;
      items: {
        properties: {
          [prop in keyof Props]: ToElectroAttribute<Props[prop]>;
        };
      };
    }
  : A extends z.ZodObject<infer Shape>
  ? {
      type: "map";
      properties: {
        [prop in keyof Shape]: ToElectroAttribute<Shape[prop]>;
      };
    }
  : never;

type ToElectroEntity<E extends Entity> = electrodb.Entity<
  Extract<keyof E["attributes"], string>,
  Extract<
    | IndexNames<E["key"]>
    | IndexNames<
        Exclude<E["indexes"], undefined>[keyof Exclude<E["indexes"], undefined>]
      >,
    string
  >,
  string,
  {
    model: {
      entity: E["type"];
      service: string;
      version: E["version"];
    };
    attributes: {
      [attr in keyof E["attributes"]]: ToElectroAttribute<
        E["attributes"][attr]
      >;
    };
    indexes: any;
  }
>;

// export interface Schema<A extends string, F extends string, C extends string> {
//   readonly model: {
//     readonly entity: string;
//     readonly service: string;
//     readonly version: string;
//   };
//   readonly attributes: {
//     readonly [a in A]: Attribute;
//   };
//   readonly indexes: {
//     [accessPattern: string]: {
//       readonly index?: string;
//       readonly type?: "clustered" | "isolated";
//       readonly collection?: AccessPatternCollection<C>;
//       readonly pk: {
//         readonly casing?: "upper" | "lower" | "none" | "default";
//         readonly field: string;
//         readonly composite: ReadonlyArray<F>;
//         readonly template?: string;
//       };
//       readonly sk?: {
//         readonly casing?: "upper" | "lower" | "none" | "default";
//         readonly field: string;
//         readonly composite: ReadonlyArray<F>;
//         readonly template?: string;
//       };
//     };
//   };
// }

export type Client<Entities extends Entity[]> = {
  [type in Entities[number]["type"]]: ToElectroEntity<
    Extract<Entities[number], { type: type }>
  >;
};

export function table<Name extends string, Entities extends Entity[]>(
  name: Name,
  props: {
    entities: Entities;
  }
): Table<Name, Entities> {
  return {
    name,
    ...props,
    // TODO
    client: null as any,
    stream(name, handler) {
      // TODO
    },
  };
}

export interface User extends z.infer<typeof User.schema> {}

export const User = entity("User", {
  version: "0.0.0",
  key: {
    partition: ["userId"],
  },
  attributes: {
    userId: z.string(),
    name: z.string(),
    meta: z.object({
      key: z.string(),
    }),
  },
  indexes: {
    byUserId: {
      partition: ["name"],
    },
  },
});

export const Customer = entity("Customer", {
  version: "0.0.0",
  key: {
    partition: ["customerId"],
  },
  attributes: {
    customerId: z.string(),
    createdTime: z.date(),
  },
  indexes: {
    byCreatedTime: {
      partition: [],
      range: ["createdTime"],
    },
  },
});

export const Store = table("Store", {
  entities: [User, Customer],
});

Store.client.User.create({
  name: "",
  userId: "",
  meta: {
    key: "",
  },
});

export const onStoreChange = Store.stream("onStoreChange", async (entity) => {
  if (entity.new.type === "Customer") {
    entity.old?.type;
  }
});

import z from "zod";
import { entity } from "../src/entity/index.js";
import { Infer } from "../src/infer.js";

enum Enum {
  A,
  B = "B",
}

const testShape = {
  string: z.string(),
  opString: z.string().optional(),
  enum: z.enum(["a", "b"]),
  nativeEnum: z.nativeEnum(Enum),
  boolean: z.boolean(),
  number: z.number(),
  null: z.null(),
  array: z.array(z.string()),
  obj: z.object({ a: z.string() }),
  nested: z.object({ obj: z.object({ a: z.string() }) }),
  tuple: z.tuple([z.string(), z.number()]),
  set: z.set(z.string()),
  any: z.any(),
  bigint: z.bigint(),
};

/**
 * Test that various forms of job attributes are accepted by the entity attributes.
 *
 * Note: the intention here is to test the types.
 */
test("entity attribute values", () => {
  entity("aTestEntity1", {
    attributes: testShape,
    partition: ["any", "bigint", "enum", "nativeEnum", "number", "string"],
    // @ts-expect-error
    sort: ["blah", "set"],
  });
});

test("entity attribute supports .transform (i.e. ZodEffects) as values and pk/sk", async () => {
  async function _never() {
    const myEntity = entity("aTestEntity3", {
      partition: ["userID"],
      sort: ["createdTime"],
      attributes: {
        userID: z.string(),
        /**
         * Created Time
         */
        createdTime: z
          .string()
          .datetime()
          .transform((d) => new Date(d)),
        /**
         * Foo
         */
        foo: z.string().optional(),
      },
    });
    const a = await myEntity.get({
      userID: "a",
      // date is supported as a key
      createdTime: new Date(),
    });
    // must be a date
    const date: Date = a?.createdTime!;

    myEntity.query({
      userID: "a",
      $between: [
        {
          createdTime: new Date(),
        },
        {
          createdTime: new Date(),
        },
      ],
    });

    myEntity.query({
      userID: "a",
      createdTime: {
        // can use a Date to beginsWith
        $beginsWith: new Date(),
      },
    });

    myEntity.query({
      userID: "a",
      createdTime: {
        // can use a String to beginsWith
        $beginsWith: "2020",
      },
    });

    myEntity.query({
      userID: "a",
      // @ts-expect-error - cannot use a number for startsWith
      createdTime: {
        $beginsWith: 1,
      },
    });

    entity("aTestEntity4", {
      // @ts-expect-error - date is not supported because it does not map to string
      partition: ["createdTime"],
      attributes: {
        userID: z.string(),
        // @ts-expect-error - date is not supported because it does not map to string
        createdTime: z.date(),
      },
    });
  }
});

import { entity } from "../src/entity/index.js";
import z from "zod";

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

/**
 * Test that a z.object can be provided instead of a shape.
 *
 * Note: the intention here is to test the types.
 */
test("entity attribute from z.object", () => {
  entity("aTestEntity2", {
    attributes: z.object(testShape),
    partition: ["any", "bigint", "enum", "nativeEnum", "number", "string"],
    // @ts-expect-error
    sort: ["blah", "set"],
  });
});

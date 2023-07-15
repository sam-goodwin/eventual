import { z } from "zod";
import { entity } from "../src/entity/entity.js";
import { Infer } from "../src/infer.js";

const Person = entity("Person", {
  partition: ["name"],
  attributes: {
    name: z.string(),
  },
});

type Person = Infer<typeof Person>;

const person: Person = {
  name: "John",
};

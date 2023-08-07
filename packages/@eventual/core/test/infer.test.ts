import { z } from "zod";
import { entity } from "../src/entity/entity.js";
import { Infer } from "../src/infer.js";
import { workflow } from "../src/workflow.js";

test("Person", () => {
  const Person = entity("Person", {
    partition: ["name"],
    attributes: {
      name: z.string(),
      optional: z.string().optional(),
    },
  });
  type Person = Infer<typeof Person>;
  // 'optional' should maintain '?' modifier
  const person: Person = {
    name: "John",
  };

  const wf = workflow("personTest", async () => {
    // 'optional' should maintain '?' modifier
    Person.put({
      name: "John",
    });
  });

  console.log(person, wf);
});

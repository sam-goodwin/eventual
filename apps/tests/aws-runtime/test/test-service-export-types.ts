/**
 * This file is not meant to be run.
 *
 * It instead tests that commands and entity types can be exported without portability problems.
 */

import { Infer, command, entity } from "@eventual/core";
import { z } from "zod";

export type Person = Infer<typeof Person>;

export const Person = entity("Person", {
  partition: ["personID"],
  attributes: {
    personID: z.string(),
    optionalProp: z.string().optional(),
  },
});

export const getPerson = command(
  "getPerson",
  // explicit type reference to a type inferred from Person
  async (person: Person): Promise<Person> => {
    return {
      personID: person.personID,
    };
  }
);

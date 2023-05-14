import { z } from "zod";
import type { CompositeKeyPart } from "../entity/key.js";

export interface KeyDefinitionPart {
  type: "number" | "string";
  keyAttribute: string;
  attributes: readonly string[];
}

export interface KeyDefinition {
  partition: KeyDefinitionPart;
  sort?: KeyDefinitionPart;
}

export function computeKeyDefinition(
  attributes: z.ZodObject<any>,
  partition: CompositeKeyPart<any>,
  sort?: CompositeKeyPart<any>
): KeyDefinition {
  const entityZodShape = attributes.shape;

  return {
    partition: formatKeyDefinitionPart(partition),
    sort: sort ? formatKeyDefinitionPart(sort) : undefined,
  };

  function formatKeyDefinitionPart(
    keyAttributes: CompositeKeyPart<any>
  ): KeyDefinitionPart {
    const [head, ...tail] = keyAttributes;

    if (!head) {
      throw new Error(
        "Entity Key Part must contain at least one segment. Sort Key may be undefined."
      );
    }

    // the value will be a number if there is a single part to the composite key part and the value is already a number.
    // else a string will be formatted
    const type =
      tail.length === 0 && entityZodShape[head] instanceof z.ZodNumber
        ? "number"
        : "string";

    const attribute = keyAttributes.join("|");

    return {
      type,
      keyAttribute: attribute,
      attributes: keyAttributes,
    };
  }
}

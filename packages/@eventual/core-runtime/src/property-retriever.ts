import {
  PropertyKind,
  PropertySymbol,
  PropertyType,
  type Property,
} from "@eventual/core/internal";
import type { LazyValue } from "./utils.js";

export type AllPropertyRetrievers = {
  [K in keyof typeof PropertyKind]: PropertyRetriever<
    Property & {
      [PropertySymbol]: (typeof PropertyKind)[K];
    }
  >;
};

export type PropertyRetriever<P extends Property = Property> =
  | PropertyResolver<P>
  | LazyValue<PropertyType<P>>
  | ((property: P) => PropertyType<P>);

export interface PropertyResolver<P extends Property = Property> {
  getProperty(property: P): PropertyType<P>;
}

export function getEventualProperty(
  property: Property,
  retriever: PropertyRetriever
) {
  if (typeof retriever === "function") {
    return retriever(property);
  } else if (typeof retriever === "object" && "getProperty" in retriever) {
    return retriever.getProperty(property);
  } else {
    return retriever;
  }
}

export class UnsupportedPropertyRetriever<P extends Property = Property>
  implements PropertyResolver<P>
{
  constructor(private name: string) {}
  public getProperty(_property: P): any {
    throw new Error(
      `Property ${
        PropertyKind[_property[PropertySymbol]]
      } is not supported by ${this.name}.`
    );
  }
}

/**
 * Aggregated Property Retriever that supports any eventual property.
 */
export class AllPropertyRetriever implements PropertyResolver {
  constructor(private retrievers: AllPropertyRetrievers) {}

  public getProperty<P extends Property>(property: P): PropertyType<P> {
    const retriever = this.retrievers[
      PropertyKind[property[PropertySymbol]] as keyof typeof PropertyKind
    ] as PropertyRetriever | undefined;

    if (retriever) {
      return getEventualProperty(property, retriever) as PropertyType<P>;
    }

    throw new Error(`Missing Property Retriever for ${property}`);
  }
}

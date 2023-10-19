import superjson from "superjson";

export function toJSON(data: any) {
  return JSON.stringify(superjson.serialize(data));
}

export function fromJSON<T = any>(data: string): T {
  return superjson.deserialize(JSON.parse(data));
}

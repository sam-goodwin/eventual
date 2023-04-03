export function paginateItems<Item>(
  items: Item[],
  sort: (a: Item, b: Item) => number,
  filter?: (item: Item) => boolean,
  direction?: "ASC" | "DESC",
  limit?: number,
  nextToken?: string
) {
  const tokenPayload = nextToken ? deserializeToken(nextToken) : undefined;
  const sortedItems = items.sort((a, b) =>
    direction === "DESC" ? sort(a, b) : -sort(a, b)
  );
  const filtered = filter ? sortedItems.filter(filter) : sortedItems;
  const start = tokenPayload?.index ?? 0;
  const rangeItems = filtered.slice(start, limit ? start + limit : undefined);

  return {
    items: rangeItems,
    nextToken:
      start + rangeItems.length < filtered.length
        ? serializeToken({ index: start + rangeItems.length })
        : undefined,
  };
}

export interface TokenPayload {
  index: number;
}

export function serializeToken(payload: TokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function deserializeToken(token: string): TokenPayload {
  return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
}

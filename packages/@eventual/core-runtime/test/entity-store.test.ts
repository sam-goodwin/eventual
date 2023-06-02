import {
  NormalizedEntityCompositeQueryKey,
  normalizeCompositeQueryKey,
} from "../src/stores/entity-store.js";

describe("normalizeCompositeQueryKey", () => {
  test("should normalize composite query key", () => {
    expect(
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part"],
            keyAttribute: "part",
            type: "string",
          },
          sort: { attributes: ["sort"], keyAttribute: "sort", type: "string" },
        },
        {
          part: "a",
          sort: "b",
        }
      )
    ).toEqual<NormalizedEntityCompositeQueryKey>({
      partition: {
        attributes: ["part"],
        keyAttribute: "part",
        keyValue: "a",
        partialValue: false,
        parts: [{ field: "part", value: "a" }],
        type: "string",
      },
      sort: {
        attributes: ["sort"],
        keyAttribute: "sort",
        keyValue: "b",
        partialValue: false,
        parts: [{ field: "sort", value: "b" }],
        type: "string",
      },
    });
  });

  test("should normalize composite query key without a sort key", () => {
    expect(
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part"],
            keyAttribute: "part",
            type: "string",
          },
        },
        {
          part: "a",
          sort: "b",
        }
      )
    ).toEqual<NormalizedEntityCompositeQueryKey>({
      partition: {
        attributes: ["part"],
        keyAttribute: "part",
        keyValue: "a",
        partialValue: false,
        parts: [{ field: "part", value: "a" }],
        type: "string",
      },
    });
  });

  test("should normalize composite query key with a multi-attribute partition key", () => {
    expect(
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part", "part2"],
            keyAttribute: "part|part2",
            type: "string",
          },
        },
        {
          part: "a",
          part2: 1,
          sort: "b",
        }
      )
    ).toEqual<NormalizedEntityCompositeQueryKey>({
      partition: {
        attributes: ["part", "part2"],
        keyAttribute: "part|part2",
        keyValue: "a#1",
        partialValue: false,
        parts: [
          { field: "part", value: "a" },
          { field: "part2", value: 1 },
        ],
        type: "string",
      },
    });
  });

  test("should fail to normalize composite query key with a partial partition key", () => {
    expect(() =>
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part", "part2"],
            keyAttribute: "part|part2",
            type: "string",
          },
        },
        {
          part: "a",
          sort: "b",
        }
      )
    ).toThrow(new Error("Query key partition part cannot be partial"));
  });

  test("should normalize composite key with sort conditions", () => {
    expect(
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part"],
            keyAttribute: "part",
            type: "string",
          },
          sort: {
            attributes: ["sort"],
            keyAttribute: "sort",
            type: "string",
          },
        },
        {
          part: "a",
          sort: { beginsWith: "b" } as any,
        }
      )
    ).toEqual<NormalizedEntityCompositeQueryKey>({
      partition: {
        attributes: ["part"],
        keyAttribute: "part",
        keyValue: "a",
        partialValue: false,
        parts: [{ field: "part", value: "a" }],
        type: "string",
      },
      sort: {
        attributes: ["sort"],
        keyAttribute: "sort",
        condition: { beginsWith: "b" },
        parts: [{ field: "sort", value: { beginsWith: "b" } }],
        type: "string",
      },
    });
  });

  test("should normalize composite key with multi-attribute sort conditions", () => {
    expect(
      normalizeCompositeQueryKey(
        {
          partition: {
            attributes: ["part"],
            keyAttribute: "part",
            type: "string",
          },
          sort: {
            attributes: ["sort", "sort2"],
            keyAttribute: "sort|sort2",
            type: "string",
          },
        },
        {
          part: "a",
          sort: "b",
          sort2: { beginsWith: "c" } as any,
        }
      )
    ).toEqual<NormalizedEntityCompositeQueryKey>({
      partition: {
        attributes: ["part"],
        keyAttribute: "part",
        keyValue: "a",
        partialValue: false,
        parts: [{ field: "part", value: "a" }],
        type: "string",
      },
      sort: {
        attributes: ["sort", "sort2"],
        keyAttribute: "sort|sort2",
        condition: { beginsWith: "b#c" },
        parts: [
          { field: "sort", value: "b" },
          { field: "sort2", value: { beginsWith: "c" } },
        ],
        type: "string",
      },
    });
  });
});

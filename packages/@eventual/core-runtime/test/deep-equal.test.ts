import { deepEqual } from "../src/utils.js";

describe("deepEqual function", () => {
  test("should handle primitive types", () => {
    expect(deepEqual(5, 5)).toBe(true);
    expect(deepEqual("hello", "hello")).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(undefined, null)).toBe(false);
  });

  test("should handle arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(deepEqual([1, 2, [3, 4]], [1, 2, [3, 4]])).toBe(true);
    expect(deepEqual([1, 2, [3, 4]], [1, 2, [3, 5]])).toBe(false);
  });

  test("should handle objects", () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 3 } })).toBe(true);
    expect(deepEqual({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 4 } })).toBe(false);
  });

  test("should differentiate between objects and arrays", () => {
    expect(deepEqual([1, 2, 3], { 0: 1, 1: 2, 2: 3 })).toBe(false);
  });

  test("should handle null and objects", () => {
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
  });

  test("should handle nested structures", () => {
    const objA = {
      a: {
        b: {
          c: [1, 2, 3],
        },
        d: "hello",
      },
      e: [4, 5],
    };

    const objB = {
      a: {
        b: {
          c: [1, 2, 3],
        },
        d: "hello",
      },
      e: [4, 5],
    };

    const objC = {
      a: {
        b: {
          c: [1, 2, 4],
        },
        d: "hello",
      },
      e: [4, 5],
    };

    expect(deepEqual(objA, objB)).toBe(true);
    expect(deepEqual(objA, objC)).toBe(false);
  });

  test("undefined should be the same as missing in an object", () => {
    expect(
      deepEqual(
        {
          something: undefined,
        },
        {}
      )
    ).toBeTruthy();
    expect(
      deepEqual(
        {
          something: undefined,
        },
        { something: false }
      )
    ).toBeFalsy();
  });

  test("undefined not should be the same as missing in an array", () => {
    expect(deepEqual([, ,], [, ,])).toBeTruthy();
    expect(deepEqual([undefined], [])).toBeFalsy();
  });
});

import { hookDate, restoreDate } from "../src/runtime/date-hook.js";

afterEach(() => restoreDate());

const goalDate = new Date("2020-01-01");
const now = Date.now();

describe("hook", () => {
  test("new", () => {
    hookDate(() => goalDate.getTime());

    const d = new Date();
    expect(d.getTime()).toEqual(goalDate.getTime());
  });

  test("now", () => {
    hookDate(() => goalDate.getTime());

    expect(Date.now()).toEqual(goalDate.getTime());
  });

  test("pass through", () => {
    hookDate(() => undefined);

    const d = new Date();
    expect(percOfNow(d.getTime())).toBeCloseTo(1);
    // prove that an overridden time would fail this test
    const d2 = new Date(goalDate);
    expect(percOfNow(d2.getTime())).not.toBeCloseTo(1);
  });

  test("pass through now", () => {
    hookDate(() => undefined);

    expect(percOfNow(Date.now())).toBeCloseTo(1);

    hookDate(() => goalDate.getTime());
    // prove that an overridden time would fail this test
    expect(percOfNow(Date.now())).not.toBeCloseTo(1);
  });
});

test("restore", () => {
  hookDate(() => goalDate.getTime());

  restoreDate();

  const d = new Date();
  expect(percOfNow(d.getTime())).toBeCloseTo(1);
  expect(percOfNow(Date.now())).toBeCloseTo(1);

  hookDate(() => goalDate.getTime());

  // prove that an overridden time would fail this test
  const d2 = new Date();
  expect(percOfNow(d2.getTime())).not.toBeCloseTo(1);
  // prove that an overridden time would fail this test
  expect(percOfNow(Date.now())).not.toBeCloseTo(1);
});

/**
 * Helper that checks for nearly identical times.
 *
 * It is difficult to test "now", but we want to prove that
 * the hook changes the behavior and can change back.
 */
function percOfNow(time: number) {
  return time / (1.0 * now);
}

test("instanceof", () => {
  expect(new Date()).toBeInstanceOf(Date);
});

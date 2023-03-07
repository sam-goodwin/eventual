import { hookDate, overrideDateScope, restoreDate } from "../src/date-hook.js";

afterEach(() => restoreDate());

const goalDate = new Date("2020-01-01");
const goalDate2 = new Date("2021-01-01");
const now = Date.now();

describe("hook", () => {
  test("new", () => {
    hookDate();

    overrideDateScope(goalDate.getTime(), () => {
      const d = new Date();
      expect(d.getTime()).toEqual(goalDate.getTime());
    });
  });

  test("now", () => {
    hookDate();

    overrideDateScope(goalDate.getTime(), () => {
      expect(Date.now()).toEqual(goalDate.getTime());
    });
  });

  test("set date", () => {
    hookDate();

    overrideDateScope(undefined, (setDate) => {
      setDate(goalDate.getTime());
      expect(Date.now()).toEqual(goalDate.getTime());
    });
  });

  test("scopes", () => {
    hookDate();

    // outer scope is goalDate
    overrideDateScope(goalDate.getTime(), (setDate) => {
      // should be goal date
      expect(Date.now()).toEqual(goalDate.getTime());
      // innser scope is set to passthrough
      overrideDateScope(undefined, (setDate2) => {
        const d = new Date();
        expect(percOfNow(d.getTime())).toBeCloseTo(1);
        // update to new date in inner
        setDate2(goalDate2.getTime());
        expect(Date.now()).toEqual(goalDate2.getTime());
        // update outer to passthrough
        setDate(undefined);
      });
      // outer is now passthrough
      const d = new Date();
      expect(percOfNow(d.getTime())).toBeCloseTo(1);
    });
  });

  test("pass through", () => {
    hookDate();

    overrideDateScope(undefined, () => {
      const d = new Date();
      expect(percOfNow(d.getTime())).toBeCloseTo(1);
      // prove that an overridden time would fail this test
      const d2 = new Date(goalDate);
      expect(percOfNow(d2.getTime())).not.toBeCloseTo(1);
    });
  });

  test("pass through now", () => {
    hookDate();

    overrideDateScope(undefined, (setTime) => {
      expect(percOfNow(Date.now())).toBeCloseTo(1);

      setTime(goalDate.getTime());
      // prove that an overridden time would fail this test
      expect(percOfNow(Date.now())).not.toBeCloseTo(1);
    });
  });
});

test("restore", () => {
  hookDate();

  restoreDate();

  overrideDateScope(goalDate.getTime(), (setTime) => {
    const d = new Date();
    expect(percOfNow(d.getTime())).toBeCloseTo(1);
    expect(percOfNow(Date.now())).toBeCloseTo(1);

    hookDate();
    setTime(goalDate.getTime());

    // prove that an overridden time would fail this test
    const d2 = new Date();
    expect(percOfNow(d2.getTime())).not.toBeCloseTo(1);
    // prove that an overridden time would fail this test
    expect(percOfNow(Date.now())).not.toBeCloseTo(1);
  });
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

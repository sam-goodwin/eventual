import { LogLevel } from "@eventual/core";
import { format } from "util";
import { DefaultLogFormatter } from "../src/log-agent.js";

describe("formatter", () => {
  test("object", () => {
    const obj = { obj: {} };
    console.log(obj);
    expect(
      new DefaultLogFormatter().format({
        context: { executionId: "" },
        level: LogLevel.DEBUG,
        data: [obj],
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\t${format(obj)}`);
  });

  test("string", () => {
    const val = "some string";
    console.log(val);
    expect(
      new DefaultLogFormatter().format({
        context: { executionId: "" },
        level: LogLevel.DEBUG,
        data: [val],
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\t${format(val)}`);
  });

  test("multiple", () => {
    const vals = [{ a: "a", B: { c: "c" } }, "some string"];
    console.log(...vals);
    expect(
      new DefaultLogFormatter().format({
        context: { executionId: "" },
        level: LogLevel.DEBUG,
        data: vals,
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\t${format(...vals)}`);
  });

  test("activity", () => {
    const obj = { obj: {} };
    console.log(obj);
    expect(
      new DefaultLogFormatter().format({
        context: {
          activityName: "act",
          seq: 1,
          executionId: "",
        },
        level: LogLevel.DEBUG,
        data: [obj],
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\tact:1\t${format(obj)}`);
  });
});

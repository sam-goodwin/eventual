import { LogLevel } from "@eventual/core";
import { format } from "util";
import { DefaultLogFormatter } from "../src/log-agent.js";

describe("formatter", () => {
  test("object", () => {
    const obj = { obj: {} };
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
    expect(
      new DefaultLogFormatter().format({
        context: { executionId: "" },
        level: LogLevel.DEBUG,
        data: vals,
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\t${format(...vals)}`);
  });

  test("task", () => {
    const obj = { obj: {} };
    expect(
      new DefaultLogFormatter().format({
        context: {
          taskName: "task",
          seq: 1,
          executionId: "",
        },
        level: LogLevel.DEBUG,
        data: [obj],
        time: 1000,
      })
    ).toEqual(`${LogLevel.DEBUG}\ttask:1\t${format(obj)}`);
  });
});

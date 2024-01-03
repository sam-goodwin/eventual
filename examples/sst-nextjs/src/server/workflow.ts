import { duration, workflow } from "@eventual/core";
import { tick, tock } from "./event";

export const tickTock = workflow("tickTock", async (input?: string) => {
  let i = 0;
  while (true) {
    // emit the tick event
    await tick.emit({
      time: Date.now(),
    });

    // put the workflow to sleep for 1 minute
    await duration(1, "minute");

    // emit the tock event
    await tock.emit({
      time: Date.now(),
    });

    if (i === 100) {
      break;
    }
  }
});

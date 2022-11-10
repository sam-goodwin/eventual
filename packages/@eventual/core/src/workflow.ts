import {
  Activity,
  getActivities,
  isAction,
  isActivity,
  isAwaitAll,
  reset,
  resetActivities,
} from "./activity";
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  createFailed,
  createResolved,
  Failed,
} from "./result";
import { assertNever } from "./util";

export class DeterminismError extends Error {}

export function executeWorkflow(
  generator: Generator,
  state: Result[]
): Result | Activity[] {
  reset();
  // first step always starts with an undefined input value
  let yieldResult = generator.next();
  while (true) {
    const command = yieldResult.value;

    if (yieldResult.done) {
      const dangling = getActivities();
      if (dangling.length > 0) {
        debugger;
      }
      if (isActivity(command)) {
        // this is when the Promise is the final returned value
        if (command.index in state) {
        }
      } else {
        return createResolved(command);
      }
    } else {
      const outcome = step(command);
      if (outcome) {
        return outcome;
      }
    }
  }

  function next(value: any) {
    resetActivities();
    return generator.next(value);
  }

  function fail(err: any) {
    resetActivities();
    return generator.throw(err);
  }

  function step(command: Activity): Failed | Activity[] | void {
    if (isAction(command)) {
      if (command.index in state) {
        const result = state[command.index]!;
        if (isResolved(result)) {
          yieldResult = next(result.value);
        } else if (isFailed(result)) {
          try {
            yieldResult = fail(result.error);
          } catch (error) {
            console.error(`the workflow crashed`);
            return createFailed(error);
          }
        } else if (isPending(result)) {
          // we're still waiting for this value
          return [];
        } else {
          return assertNever(result);
        }
      } else {
        // first time invoking this Action, we need to schedule it
        return [command];
      }
    } else if (isAwaitAll(command)) {
      if (command.activities.every((activity) => activity.index in state)) {
        const results: any[] = [];
        let error;
        let isError = false;
        // all activities have been scheduled, let's check if they are all completed
        for (const activity of command.activities) {
          const result = state[activity.index]!;
          if (isPending(result)) {
            // still waiting for tasks to complete
          } else if (isResolved(result)) {
            results.push(result.value);
          } else {
            isError = true;
            error = result.error;
          }
        }
        if (isError) {
          yieldResult = fail(error);
        } else {
          yieldResult = next(results);
        }
      } else if (
        command.activities.some((activity) => activity.index in state)
      ) {
        // some of these activities have been scheduled and some have not
        // this is a determinism error - it should be all or nothing each run
        throw new DeterminismError();
      } else {
        // first time seeing this command, we should schedule them
        return getActivities();
      }
    } else {
      throw new Error(`unsupported Activity`);
    }
  }
}

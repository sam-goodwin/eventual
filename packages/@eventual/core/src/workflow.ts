import {
  Activity,
  getSpawnedActivities,
  isAction,
  isActivity,
  isAwaitAll,
  resetActivities,
  resetActivityIDCounter,
} from "./activity";
import { DeterminismError } from "./error";
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  createFailed,
  createResolved,
  Failed,
} from "./result";
import { State } from "./state";
import {
  isThread,
  resetCurrentThreadID,
  resetThreadIDCounter,
  setCurrentThreadID,
} from "./thread";
import { assertNever, not } from "./util";

function reset() {
  resetActivities();
  resetActivityIDCounter();
  resetThreadIDCounter();
  resetCurrentThreadID();
}

export function executeWorkflow(
  generator: Generator,
  state: State
): Result | Activity[] {
  reset();

  return executeThread(generator, state, 0);

  function executeThread(generator: Generator, state: State, threadId: number) {
    resetActivityIDCounter();
    setCurrentThreadID(threadId);
    const thread = (state.threads[threadId] = state.threads[threadId] ?? []);
    // first step always starts with an undefined input value
    let yieldResult = generator.next();
    while (true) {
      const command = yieldResult.value;

      if (yieldResult.done) {
        const dangling = getSpawnedActivities();
        if (dangling.length > 0) {
          debugger;
        }
        if (isActivity(command)) {
          // this is when the Promise is the final returned value
          // async function main() { return call() }
          throw new Error(`not implemented`);
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

    function step(command: Activity): Failed | Activity[] | void {
      if (isAction(command)) {
        if (command.id in thread) {
          const result = thread[command.id]!;
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
        if (command.activities.every((activity) => activity.id in thread)) {
          const results: any[] = [];
          let error;
          let isError = false;
          // all activities have been scheduled, let's check if they are all completed
          for (const activity of command.activities) {
            const result = thread[activity.id]!;
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
          command.activities.some((activity) => activity.id in thread)
        ) {
          // some of these activities have been scheduled and some have not
          // this is a determinism error - it should be all or nothing each run
          throw new DeterminismError();
        } else {
          // first time seeing this command, we should schedule them
          const activities = getSpawnedActivities();
          return [
            ...activities.filter(not(isThread)),
            ...activities.flatMap((activity) => {
              if (isThread(activity)) {
                const threadResult = executeThread(
                  activity.thread,
                  state,
                  activity.id
                );
                if (Array.isArray(threadResult)) {
                  // the thread produced an array of activities
                  return threadResult;
                }
              }
              return [];
            }),
          ];
        }
      } else if (isThread(command)) {
        debugger;
      } else {
        throw new Error(`unsupported Activity`);
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
  }
}

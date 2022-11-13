import type { AwaitAll } from "./await-all";
import { Command, createCommand } from "./command";
import { Thread } from "./thread";

export const ActivitySymbol = Symbol.for("eventual:Activity");

export enum ActivityKind {
  AwaitAll = 0,
  Command = 1,
  Thread = 2,
}

export function isActivity(a: any): a is Activity {
  return a && typeof a === "object" && ActivitySymbol in a;
}

export type Activity<T = any> =
  | Command<T>
  | AwaitAll<T extends any[] ? T : never>
  | Thread<T>;

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  handler: F
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  return (...args) => {
    if (process.env.EVENTUAL_WORKER) {
      // if we're in the eventual worker, actually run the process
      return handler(...args);
    } else {
      // otherwise, return a command to invoke the activity in the worker function
      return createCommand(activityID, args) as any;
    }
  };
}

export namespace Activity {
  /**
   * Wait for all {@link activities} to complete or until at least one throws.
   *
   * This is the equivalent behavior to Promise.all.
   */
  export function all<A extends Activity[]>(
    activities: A
  ): AwaitAll<{
    [i in keyof A]: A[i] extends Activity<infer T> ? T : A[i];
  }> {
    return {
      [ActivitySymbol]: ActivityKind.AwaitAll,
      activities,
    };
  }
}

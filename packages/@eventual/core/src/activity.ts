import { createActivityCall } from "./calls/activity-call.js";
import { callableActivities } from "./global.js";
import { isActivityWorker } from "./runtime/flags.js";

export interface ActivityOpts {
  timeoutSeconds?: number;
}

export interface ActivityFunction<F extends (...args: any[]) => any> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>;
}

export interface ConfigurableActivityFunction<F extends (...args: any[]) => any>
  extends ActivityFunction<F> {
  /**
   * Immutably overrides the default options provided at activity creation time.
   *
   * ```ts
   * const act = activity("myActivity", { timeoutSeconds: 1000 }, ...);
   *
   * workflow("myWorkflow", () => {
   *    await act.withOptions({ timeoutSeconds: 100 })(); // times out after 100 seconds
   *    await act(); // times out after 1000 seconds
   * })
   * ```
   */
  withOptions(opts: ActivityOpts): ActivityFunction<F>;
}

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  handler: F
): ConfigurableActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  opts: ActivityOpts,
  handler: F
): ConfigurableActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  ...args: [opts: ActivityOpts, handler: F] | [handler: F]
): ConfigurableActivityFunction<F> {
  const [definitionOpts, handler] =
    args.length === 1 ? [undefined, args[0]] : args;
  if (isActivityWorker()) {
    // if we're in the eventual worker, actually run the process amd register the activity
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    return ((...args) => handler(...args)) as ConfigurableActivityFunction<F>;
  } else {
    // otherwise, return a command to invoke the activity in the worker function
    const createActivityFunction = (opts?: ActivityOpts): ActivityFunction<F> =>
      ((...args: Parameters<ActivityFunction<F>>) => {
        return createActivityCall(
          activityID,
          args,
          opts?.timeoutSeconds
        ) as any;
      }) as ActivityFunction<F>;
    const func = createActivityFunction(
      definitionOpts
    ) as ConfigurableActivityFunction<F>;
    func.withOptions = (opts) => {
      return createActivityFunction({
        ...definitionOpts,
        ...opts,
      });
    };
    return func;
  }
}

/**
 * Retrieve an activity function that has been registered in a workflow.
 */
export function getCallableActivity(activityId: string): Function | undefined {
  return callableActivities()[activityId];
}

export function getCallableActivityNames() {
  return Object.keys(callableActivities());
}

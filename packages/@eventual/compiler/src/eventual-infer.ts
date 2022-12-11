/**
 * This script imports a user's script and outputs a JSON object
 * to stdout containing all of the data that can be inferred.
 *
 * @see AppSpec
 */
import { eventSubscriptions, AppSpec } from "@eventual/core";

export async function infer() {
  const scriptName = process.argv[2];
  if (scriptName === undefined) {
    throw new Error(`scriptName undefined`);
  }

  await import(scriptName);

  const eventualData: AppSpec = {
    subscriptions: eventSubscriptions().flatMap((e) => e.subscriptions),
  };

  console.log(JSON.stringify(eventualData));
}

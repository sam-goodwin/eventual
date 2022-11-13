import type { Future } from "./future";

export function registerActivity<A extends Future>(activity: A): A {
  activityCollector.push(activity);
  return activity;
}

let activityCollector: Future[] = [];

export function resetActivityCollector() {
  activityCollector = [];
}

export function collectActivities() {
  const activities = activityCollector;
  resetActivityCollector();
  return activities;
}

import type { Activity } from "./activity";

export function registerActivity<A extends Activity>(activity: A): A {
  activityCollector.push(activity);
  return activity;
}

let activityCollector: Activity[] = [];

export function resetActivityCollector() {
  activityCollector = [];
}

export function collectActivities() {
  const activities = activityCollector;
  resetActivityCollector();
  return activities;
}

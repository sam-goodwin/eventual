import type { Eventual } from "./eventual";

export function registerActivity<A extends Eventual>(activity: A): A {
  activityCollector.push(activity);
  return activity;
}

let activityCollector: Eventual[] = [];

export function resetActivityCollector() {
  activityCollector = [];
}

export function collectActivities() {
  const activities = activityCollector;
  resetActivityCollector();
  return activities;
}

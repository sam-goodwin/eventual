import type { Eventual } from "./eventual.js";
import { Workflow } from "./workflow.js";

const activityCollector = (): Eventual[] =>
  ((globalThis as any).activityCollector ??= []);

export const workflows = (): Map<string, Workflow> =>
  ((globalThis as any).workflows ??= new Map<string, Workflow>());

export const callableActivities = (): Record<string, Function> =>
  ((globalThis as any).callableActivities ??= {});

export function registerActivity<A extends Eventual>(activity: A): A {
  activityCollector().push(activity);
  return activity;
}

export function resetActivityCollector() {
  (globalThis as any).activityCollector = [];
}

export function collectActivities(): Eventual[] {
  const activities = activityCollector();
  resetActivityCollector();
  return activities;
}

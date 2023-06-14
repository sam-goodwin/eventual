import type { Task } from "@eventual/core";
import {
  getEventualResource,
  getEventualResources,
} from "@eventual/core/internal";

export interface TaskProvider {
  getTask(taskId: string): Task | undefined;
  getTaskIds(): string[];
}

export class GlobalTaskProvider implements TaskProvider {
  public getTask(taskId: string): Task | undefined {
    return getEventualResource("tasks", taskId);
  }

  public getTaskIds(): string[] {
    return Array.from(getEventualResources("tasks").keys());
  }
}

import type { Task } from "@eventual/core";
import { tasks } from "@eventual/core/internal";

export interface TaskProvider {
  getTask(taskId: string): Task | undefined;
  getTaskIds(): string[];
}

export class GlobalTaskProvider implements TaskProvider {
  public getTask(taskId: string): Task | undefined {
    return tasks()[taskId];
  }

  public getTaskIds(): string[] {
    return Object.keys(tasks());
  }
}

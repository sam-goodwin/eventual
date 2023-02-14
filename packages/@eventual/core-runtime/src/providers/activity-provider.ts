import { ActivityHandler } from "@eventual/core";
import { callableActivities } from "@eventual/core/internal";

export interface ActivityProvider {
  getActivityHandler(activityId: string): ActivityHandler<any> | undefined;
  getActivityIds(): string[];
}

export class GlobalActivityProvider implements ActivityProvider {
  public getActivityHandler(activityId: string) {
    return callableActivities()[activityId];
  }

  public getActivityIds(): string[] {
    return Object.keys(callableActivities());
  }
}

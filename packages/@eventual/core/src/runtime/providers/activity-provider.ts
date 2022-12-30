import {
  ActivityHandler,
  callableActivities,
  getCallableActivityNames,
} from "../../index.js";

export interface ActivityProvider {
  getActivityHandler(activityId: string): ActivityHandler<any> | undefined;
  getActivityIds(): string[];
}

export class GlobalActivityProvider implements ActivityProvider {
  public getActivityHandler(activityId: string) {
    return callableActivities()[activityId];
  }

  public getActivityIds(): string[] {
    return getCallableActivityNames();
  }
}

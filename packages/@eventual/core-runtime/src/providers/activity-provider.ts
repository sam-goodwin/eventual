import { Activity } from "@eventual/core";
import { activities } from "@eventual/core/internal";

export interface ActivityProvider {
  getActivity(activityId: string): Activity | undefined;
  getActivityIds(): string[];
}

export class GlobalActivityProvider implements ActivityProvider {
  public getActivity(activityId: string): Activity | undefined {
    return activities()[activityId];
  }

  public getActivityIds(): string[] {
    return Object.keys(activities());
  }
}

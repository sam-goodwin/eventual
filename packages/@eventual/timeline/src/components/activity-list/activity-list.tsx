import { WorkflowStarted } from "@eventual/core";
import { endTime, TimelineActivity } from "../../event.js";
import styles from "./activity-list.module.css";

export function ActivityList({
  start,
  activities,
}: {
  start: WorkflowStarted;
  activities: TimelineActivity[];
}) {
  const workflowStart = new Date(start.timestamp).getTime();
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Activity</th>
          <th>Start</th>
          <th>End</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {activities.map((activity) => {
          const activityStart = activity.start;
          const activityEnd = endTime(activity);
          return (
            <tr key={activity.seq}>
              <td>{activity.name}</td>
              <td>{activityStart - workflowStart}ms</td>
              <td>{activityEnd ? activityEnd - workflowStart : "-"}ms</td>
              <td>{activityEnd ? activityEnd - activityStart : "-"}ms</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

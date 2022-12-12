import { WorkflowStarted } from "@eventual/core";
import {
  endTime,
  getDuration,
  isCompleted,
  TimelineActivity,
  Timespan,
} from "../../event.js";
import styles from "./timeline.module.css";

const palette = [
  "crimson",
  "portland-orange",
  "persian-green",
  "june-bud",
  "flickr-pink",
  "canary",
  "light-salmon",
];

export function Timeline({
  start,
  activities,
}: {
  start: WorkflowStarted;
  activities: TimelineActivity[];
}) {
  const workflowSpan = getWorkflowSpan(start, activities);
  return (
    <div className={styles["timeline-wrapper"]}>
      <div className={styles["timeline-container"]}>
        <div className={styles.scale}>
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className={styles["marker-wrapper"]}
              style={{
                left: `${i * 10}%`,
              }}
            >
              <div>
                {Math.floor((i * getDuration(workflowSpan)) / 10)}
                ms
              </div>
              <div className={styles.marker} />
            </div>
          ))}
        </div>
        {activities.map((activity) => {
          const start = percentOffset(activity.start, workflowSpan);
          const width =
            percentOffset(endTime(activity) ?? workflowSpan.end, workflowSpan) -
            start;
          return (
            <div
              key={activity.seq}
              className={styles.activity}
              style={{
                left: `${start}%`,
                width: `${width.toFixed(2)}%`,
                backgroundColor: `var(--${
                  palette[Math.floor(Math.random() * palette.length)]
                })`,
              }}
            >
              <div className={styles["activity-name"]}>{activity.name}</div>
              <div className={styles["activity-duration"]}>
                {isCompleted(activity.state)
                  ? `${activity.state.end - activity.start}ms`
                  : "-"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function percentOffset(timestamp: number, inSpan: Timespan) {
  return (100 * (timestamp - inSpan.start)) / getDuration(inSpan);
}

function getWorkflowSpan(
  start: WorkflowStarted,
  activities: TimelineActivity[]
): Timespan {
  const startTime = new Date(start.timestamp).getTime();

  const latestEnd = activities.reduce(
    (latest, activity) => Math.max(latest, endTime(activity) ?? 0),
    0
  );
  return {
    start: startTime,
    end: latestEnd,
  };
}

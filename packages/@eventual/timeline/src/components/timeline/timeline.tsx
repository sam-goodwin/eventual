import { WorkflowStarted } from "@eventual/core/internal";
import {
  endTime,
  getDuration,
  isCompleted,
  TimelineTask,
  Timespan,
} from "../../task.js";
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
  tasks,
}: {
  start: WorkflowStarted;
  tasks: TimelineTask[];
}) {
  const workflowSpan = getWorkflowSpan(start, tasks);
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
        {tasks.map((task) => {
          const start = percentOffset(task.start, workflowSpan);
          const width =
            percentOffset(endTime(task) ?? workflowSpan.end, workflowSpan) -
            start;
          return (
            <div
              key={task.seq}
              className={styles.task}
              style={{
                left: `${start}%`,
                width: `${width.toFixed(2)}%`,
                backgroundColor: `var(--${
                  palette[Math.floor(Math.random() * palette.length)]
                })`,
              }}
            >
              <div className={styles["task-name"]}>{task.name}</div>
              <div className={styles["task-duration"]}>
                {isCompleted(task.state)
                  ? `${task.state.end - task.start}ms`
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
  tasks: TimelineTask[]
): Timespan {
  const startTime = new Date(start.timestamp).getTime();

  const latestEnd = tasks.reduce(
    (latest, task) => Math.max(latest, endTime(task) ?? 0),
    0
  );
  return {
    start: startTime,
    end: latestEnd,
  };
}

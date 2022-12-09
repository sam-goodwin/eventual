import { useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import ky from "ky";
import { ReactNode } from "react";
import styles from "./App.module.css";

const palette = [
  "crimson",
  "portland-orange",
  "persian-green",
  "june-bud",
  "flickr-pink",
  "canary",
  "light-salmon",
];

function Layout({ children }: { children: ReactNode }) {
  const path = window.location.href.split("/");
  const service = path.at(-2);
  const executionId = path.at(-1);
  if (!service) {
    return <div>No service in path!</div>;
  }
  if (!executionId) {
    return <div>No execution id in path!</div>;
  }
  const decodedExecutionId = Buffer.from(executionId, "base64").toString(
    "utf-8"
  );
  return (
    <main className={styles.layout}>
      <div style={{ textAlign: "center" }}>
        <h1>Execution timeline</h1>
      </div>
      <div className={styles.info}>
        <h2 className={styles.subtitle}>Service</h2>
        <div>{service}</div>
        <h2 className={styles.subtitle}>Execution id</h2>
        <div>{decodedExecutionId}</div>
      </div>
      {children}
    </main>
  );
}

function App() {
  const { data: activities, isLoading } = useQuery(
    ["events"],
    () => {
      const executionId = window.location.href.split("/").at(-1);
      return ky(`/api/timeline/${executionId}`).json<TimelineActivity[]>();
    },
    { refetchInterval: 5000 }
  );

  if (isLoading) {
    return (
      <Layout>
        <div>Loading activities...</div>
      </Layout>
    );
  } else if (!activities?.length) {
    return (
      <Layout>
        <div>No activities</div>
      </Layout>
    );
  } else {
    const workflowSpan = getWorkflowSpan(activities);
    return (
      <Layout>
        <div className={styles["timeline-container"]}>
          <div className={styles.scale}>
            {Array.from({ length: 11 }, (_, i) => (
              <div
                className={styles["marker-wrapper"]}
                style={{
                  left: `${i * 10}%`,
                }}
              >
                <div>
                  {Math.floor((i * workflowSpan.duration) / 10)}
                  ms
                </div>
                <div className={styles.marker} />
              </div>
            ))}
          </div>
          {activities.map((activity) => {
            const start = percentOffset(activity.start, workflowSpan);
            const width =
              percentOffset(
                endTime(activity) ?? workflowSpan.end,
                workflowSpan
              ) - start;
            return (
              <div
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
                    ? `${activity.state.duration}ms`
                    : "-"}
                </div>
              </div>
            );
          })}
        </div>
      </Layout>
    );
  }
}

export default App;

interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: number;
  state: ActivityState;
}

type Completed = { status: "completed"; duration: number };
type Failed = { status: "failed"; duration: number };
type InProgress = { status: "inprogress" };
type ActivityState = Completed | Failed | InProgress;
type Timespan = { start: number; end: number; duration: number };

function isCompleted(state: ActivityState): state is Completed {
  return state.status == "completed";
}

function isFailed(state: ActivityState): state is Failed {
  return state.status == "failed";
}

function percentOffset(timestamp: number, inSpan: Timespan) {
  return (100 * (timestamp - inSpan.start)) / inSpan.duration;
}

function endTime(activity: TimelineActivity): number | undefined {
  let { state } = activity;
  return isCompleted(state)
    ? activity.start + state.duration
    : isFailed(state)
    ? activity.start + state.duration
    : undefined;
}

function getWorkflowSpan(activities: TimelineActivity[]): Timespan {
  const earliestStart = activities.reduce(
    (earliest, activity) => Math.min(earliest, activity.start),
    Number.MAX_VALUE
  );
  const latestEnd = activities.reduce(
    (latest, activity) => Math.max(latest, endTime(activity) ?? 0),
    0
  );
  return {
    start: earliestStart,
    end: latestEnd,
    duration: latestEnd - earliestStart,
  };
}

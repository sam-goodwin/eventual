import { useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import ky from "ky";
import { ReactNode } from "react";

function Layout({ children }: { children: ReactNode }) {
  const executionId = window.location.href.split("/").at(-1);
  if (!executionId) {
    return <div>No execution id!</div>;
  }
  const decodedExecutionId = Buffer.from(executionId, "base64").toString(
    "utf-8"
  );
  return (
    <div style={{ width: "100vw", minHeight: "100vh", textAlign: "center" }}>
      <h1>Timeline</h1>
      <h2>{decodedExecutionId}</h2>
      {children}
    </div>
  );
}

function App() {
  const { data: activities } = useQuery(
    ["events"],
    () => {
      const executionId = window.location.href.split("/").at(-1);
      return ky(`/api/timeline/${executionId}`).json<TimelineActivity[]>();
    },
    { refetchInterval: 5000 }
  );

  if (!activities) {
    return (
      <Layout>
        <div>No activities</div>
      </Layout>
    );
  } else {
    const workflowSpan = getWorkflowSpan(activities);
    return (
      <Layout>
        <div className="timeline-container">
          {activities.map((activity) => {
            const start = percentOffset(activity.start, workflowSpan);
            const width =
              percentOffset(
                endTime(activity) ?? workflowSpan.end,
                workflowSpan
              ) - start;
            return (
              <div
                className="activity"
                style={{
                  position: "relative",
                  left: `${start}%`,
                  width: `${width.toFixed(2)}%`,
                  height: 64,
                }}
              >
                <div>{activity.name}</div>
                <div>
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
type Timespan = { start: number; end: number };

function isCompleted(state: ActivityState): state is Completed {
  return state.status == "completed";
}

function isFailed(state: ActivityState): state is Failed {
  return state.status == "failed";
}

function percentOffset(timestamp: number, inSpan: Timespan) {
  return (100 * (timestamp - inSpan.start)) / (inSpan.end - inSpan.start);
}

function endTime(activity: TimelineActivity): number | undefined {
  let { state } = activity;
  return isCompleted(state)
    ? activity.start + state.duration
    : isFailed(state)
    ? activity.start + state.duration
    : undefined;
}

function getWorkflowSpan(activities: TimelineActivity[]) {
  const earliestStart = activities.reduce(
    (earliest, activity) => Math.min(earliest, activity.start),
    Number.MAX_VALUE
  );
  const latestEnd = activities.reduce(
    (latest, activity) => Math.max(latest, endTime(activity) ?? 0),
    0
  );
  return { start: earliestStart, end: latestEnd };
}

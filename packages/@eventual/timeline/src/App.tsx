import { HttpServiceClient } from "@eventual/client";
import { decodeExecutionId, WorkflowStarted } from "@eventual/core";
import { useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { ReactNode } from "react";
import styles from "./App.module.css";
import { ActivityList } from "./components/activity-list/activity-list.js";
import { Timeline } from "./components/timeline/timeline.js";

const serviceClient = new HttpServiceClient({ serviceUrl: "/api" });

function Layout({
  start,
  children,
}: {
  start?: WorkflowStarted;
  children: ReactNode;
}) {
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
      <table className={styles.info}>
        <thead>
          <tr>
            <th>Service</th>
            <th>Execution Id</th>
            <th>Execution Started</th>
          </tr>
        </thead>
        <tr>
          <td>{service}</td>
          <td>{decodedExecutionId}</td>
          <td>
            {" "}
            {start?.timestamp != null
              ? new Date(start.timestamp).toLocaleString(undefined, {
                  dateStyle: "long",
                  timeStyle: "long",
                })
              : ""}
          </td>
        </tr>
      </table>
      <div className={styles["execution-input"]}>
        <h2 className={styles.subtitle}>Execution input:</h2>
        <pre className={styles.input}>{JSON.stringify(start?.input)}</pre>
      </div>
      <div className={styles["timeline-container"]}>{children}</div>
    </main>
  );
}

function App() {
  const { data: timeline, isLoading } = useQuery(
    ["events"],
    () => {
      const executionId = window.location.href.split("/").at(-1);
      const history = serviceClient.getExecutionWorkflowHistory(
        decodeExecutionId(executionId!)
      );
      console.log(history);
      return {
        history,
        activities: [],
        start: {
          type: "WorkflowStarted",
          context: { name: "hi" },
          id: "",
          timestamp: "",
          workflowName: "",
        } as WorkflowStarted,
      };
    },
    { refetchInterval: 5000 }
  );

  if (isLoading) {
    return (
      <Layout>
        <div>Loading activities...</div>
      </Layout>
    );
  } else if (!timeline?.activities.length) {
    return (
      <Layout start={timeline?.start}>
        <div>No activities</div>
      </Layout>
    );
  } else {
    return (
      <Layout start={timeline.start}>
        <Timeline start={timeline.start} activities={timeline.activities} />
        <div className={styles["activity-list-float"]}>
          <ActivityList
            start={timeline.start}
            activities={timeline.activities}
          />
        </div>
      </Layout>
    );
  }
}

export default App;

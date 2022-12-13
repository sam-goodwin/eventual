import { useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import ky from "ky";
import { ReactNode } from "react";
import { ActivityList } from "../activity-list/activity-list.js";
import styles from "./App.module.css";
import { historyToTimelineEntities, TimelineEntity } from "../../entity.js";
import { Timeline } from "../timeline/timeline.js";
import { HistoryStateEvent } from "@eventual/core";
import {
  ExecutionProperties,
  getExecutionProperties,
} from "../../execution.js";

function Layout({
  executionProperties,
  children,
}: {
  executionProperties?: ExecutionProperties;
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
            <th>State</th>
            <th>Execution Id</th>
            <th>Execution Started</th>
            <th>Execution Ended</th>
          </tr>
        </thead>
        <tr>
          <td>{service}</td>
          <td>
            {executionProperties ? stateLabel(executionProperties) : "Unknown"}
          </td>
          <td>{decodedExecutionId}</td>
          <td>
            {executionProperties?.start
              ? executionProperties.start.toLocaleString(undefined, {
                  dateStyle: "long",
                  timeStyle: "long",
                })
              : "Unknown"}
          </td>
          <td>
            {executionProperties && "end" in executionProperties.state
              ? executionProperties.state.end.toLocaleString(undefined, {
                  dateStyle: "long",
                  timeStyle: "long",
                })
              : "-"}
          </td>
        </tr>
      </table>
      <div className={styles["execution-input"]}>
        <h2 className={styles.subtitle}>Execution input:</h2>
        <pre className={styles.input}>
          {JSON.stringify(executionProperties?.input)}
        </pre>
      </div>
      <div className={styles["timeline-container"]}>{children}</div>
    </main>
  );
}

function App() {
  const {
    data: historyEvents,
    isLoading,
    isError,
  } = useQuery(
    ["events"],
    () => {
      const executionId = window.location.href.split("/").at(-1);
      return ky(`/api/executions/${executionId}/workflow-history`).json<
        HistoryStateEvent[]
      >();
    },
    { refetchInterval: 5000 }
  );

  if (isLoading) {
    return (
      <Layout>
        <div>Loading timeline...</div>
      </Layout>
    );
  } else if (isError) {
    return (
      <Layout>
        <div>Error loading timeline :(</div>
      </Layout>
    );
  }

  const timelineEntities = historyToTimelineEntities(historyEvents);

  if (!timelineEntities.length) {
    return (
      <Layout>
        <div>No events!</div>
      </Layout>
    );
  }

  const executionProperties = getExecutionProperties(timelineEntities);
  if (!executionProperties) {
    return (
      <Layout>
        <div>No workflowStart event!</div>
      </Layout>
    );
  }

  return (
    <Layout executionProperties={executionProperties}>
      <Timeline
        executionProperties={executionProperties}
        entities={timelineEntities}
      />
      <div className={styles["activity-list-float"]}>
        <ActivityList
          executionProperties={executionProperties}
          entities={timelineEntities}
        />
      </div>
    </Layout>
  );
}

export default App;

export function stateLabel({ state }: ExecutionProperties) {
  switch (state.type) {
    case "complete":
      return `Complete`;
    case "failed":
      return `Failed - ${state.error}`;
    case "inProgress":
      return "In Progress";
  }
}

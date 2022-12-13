import { TimelineEntity } from "../../entity.js";
import { ExecutionProperties } from "../../execution.js";
import styles from "./activity-list.module.css";

export function ActivityList({
  entities,
  executionProperties,
}: {
  entities: TimelineEntity[];
  executionProperties: ExecutionProperties;
}) {
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
        {entities.map((entity) => {
          const root = entity.rootEvent;
          const leaf = entity.leafEvents[0];
          const activityStart = new Date(root.timestamp).getTime();
          const activityEnd = leaf
            ? new Date(leaf.timestamp).getTime()
            : executionProperties.latest.getTime();
          return (
            <tr key={"seq" in root ? root.seq : root.id}>
              <td>{"name" in root ? root.name : root.type}</td>
              <td>{activityStart - executionProperties.start.getTime()}ms</td>
              <td>
                {activityEnd
                  ? activityEnd - executionProperties.start.getTime()
                  : "-"}
                ms
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

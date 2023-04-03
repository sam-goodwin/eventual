import { WorkflowStarted } from "@eventual/core/internal";
import { endTime, TimelineTask } from "../../task.js";
import styles from "./task-list.module.css";

export function TaskList({
  start,
  tasks,
}: {
  start: WorkflowStarted;
  tasks: TimelineTask[];
}) {
  const workflowStart = new Date(start.timestamp).getTime();
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Task</th>
          <th>Start</th>
          <th>End</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const taskStart = task.start;
          const taskEnd = endTime(task);
          return (
            <tr key={task.seq}>
              <td>{task.name}</td>
              <td>{taskStart - workflowStart}ms</td>
              <td>{taskEnd ? taskEnd - workflowStart : "-"}ms</td>
              <td>{taskEnd ? taskEnd - taskStart : "-"}ms</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

import {
  TaskClient,
  TaskClientProps,
  TaskWorkerRequest,
} from "../../clients/task-client.js";
import { LocalEnvConnector } from "../local-container.js";

export class LocalTaskClient extends TaskClient {
  constructor(
    private localConnector: LocalEnvConnector,
    props: Omit<TaskClientProps, "baseTime">
  ) {
    super({ ...props, baseTime: () => this.localConnector.getTime() });
  }

  public async startTask(request: TaskWorkerRequest): Promise<void> {
    // the task worker may choose to defer the submission of the event to the system.
    this.localConnector.pushWorkflowTask(request);
  }
}

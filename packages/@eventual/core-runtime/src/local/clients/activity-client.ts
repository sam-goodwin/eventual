import {
  ActivityClient,
  ActivityClientProps,
  ActivityWorkerRequest,
} from "../../clients/activity-client.js";
import { LocalEnvConnector } from "../local-container.js";

export class LocalActivityClient extends ActivityClient {
  constructor(
    private localConnector: LocalEnvConnector,
    props: Omit<ActivityClientProps, "baseTime">
  ) {
    super({ ...props, baseTime: () => this.localConnector.getTime() });
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    // the activity worker may choose to defer the submission of the event to the system.
    this.localConnector.pushWorkflowTask(request);
  }
}

import {
  ActivityClient,
  ActivityClientProps,
  ActivityWorkerRequest,
} from "../../clients/activity-client.js";
import { isActivitySendEventRequest } from "../../handlers/activity-fallback-handler.js";
import { ActivityWorker } from "../../handlers/activity-worker.js";
import { LocalEnvConnector } from "../local-environment.js";

export class LocalActivityClient extends ActivityClient {
  constructor(
    private localConnector: LocalEnvConnector,
    private activityWorker: ActivityWorker,
    props: ActivityClientProps
  ) {
    super(props);
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    // the activity worker may choose to defer the submission of the event to the system.
    const result = await this.activityWorker(
      request,
      this.localConnector.getTime(),
      // end time is the start time plus one second
      (start) => new Date(start.getTime() + 1000)
    );

    if (result) {
      if (isActivitySendEventRequest(result)) {
        this.localConnector.pushWorkflowTask({
          executionId: result.executionId,
          events: [result.event],
        });
      }
    }
  }
}

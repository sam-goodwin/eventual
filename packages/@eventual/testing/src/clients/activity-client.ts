import {
  ActivityClient,
  ActivityClientProps,
  ActivityWorker,
  ActivityWorkerRequest,
  isActivitySendEventRequest,
} from "@eventual/core-runtime";
import { TimeConnector } from "../environment.js";

export class TestActivityClient extends ActivityClient {
  constructor(
    private timeConnector: TimeConnector,
    private activityWorker: ActivityWorker,
    props: ActivityClientProps
  ) {
    super(props);
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    // the activity worker may choose to defer the submission of the event to the system.
    const result = await this.activityWorker(
      request,
      this.timeConnector.getTime(),
      // end time is the start time plus one second
      (start) => new Date(start.getTime() + 1000)
    );

    if (result) {
      if (isActivitySendEventRequest(result)) {
        this.timeConnector.pushEvent({
          executionId: result.executionId,
          events: [result.event],
        });
      }
    }
  }
}

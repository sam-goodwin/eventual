import { ActivityWorkerRequest } from "@eventual/core";
import {
  ActivityClient,
  ActivityWorker,
  ActivityClientProps,
} from "@eventual/runtime-core";
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
    return this.activityWorker(
      request,
      this.timeConnector.getTime(),
      // end time is the start time plus one second
      (start) => new Date(start.getTime() + 1000)
    );
  }
}

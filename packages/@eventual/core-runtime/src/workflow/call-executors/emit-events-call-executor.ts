import type { EmitEventsCall } from "@eventual/core/internal";
import type { EventClient } from "../../clients/event-client.js";
import type { EventualWorkflowExecutor } from "../call-executor.js";

export class EmitEventsWorkflowExecutor
  implements EventualWorkflowExecutor<EmitEventsCall>
{
  constructor(private eventClient: EventClient) {}
  public async executeForWorkflow(call: EmitEventsCall): Promise<any> {
    await this.eventClient.emitEvents(...call.events);
  }
}

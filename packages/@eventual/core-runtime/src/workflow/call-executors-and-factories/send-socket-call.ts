import {
  type SocketSendCall,
  WorkflowCallHistoryType,
} from "@eventual/core/internal";
import { Result } from "../../result.js";
import { EventualFactory } from "../call-eventual-factory.js";
import { EventualDefinition } from "../eventual-definition.js";

export class SendSocketCallEventualFactory
  implements EventualFactory<SocketSendCall>
{
  public initializeEventual(call: SocketSendCall): EventualDefinition<any> {
    return {
      createCallEvent: (seq) => {
        const [input, base64] =
          call.input instanceof Buffer
            ? [call.input.toString("base64"), true]
            : [call.input, false];

        return {
          type: WorkflowCallHistoryType.SocketMessageSent,
          seq,
          connectionId: call.connectionId,
          input,
          isBase64Encoded: base64,
          socketName: call.name,
        };
      },
      result: Result.resolved(undefined),
    };
  }
}

import type { CallOutput, SocketCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { SocketClient } from "../clients/socket-client.js";

export class SocketCallExecutor implements CallExecutor<SocketCall> {
  constructor(private socketClient: SocketClient) {}
  public execute(call: SocketCall): Promise<CallOutput<SocketCall>> {
    return this.socketClient[call.operation.operation](
      call.operation.socketName,
      // @ts-ignore - typescript won't let me case the params...
      ...call.operation.params
    );
  }
}
